const Notification        = require('../models/Notification');
const NotificationReceipt = require('../models/NotificationReceipt');
const User                = require('../models/User');
const School              = require('../models/School');
const StudentProfile      = require('../models/StudentProfile');
const ClassSection        = require('../models/ClassSection');
const Class               = require('../models/Class');
const { sendNotificationEmail } = require('../utils/sendEmail');
const sseClients          = require('../utils/sseClients');

/* ─────────────────────────────────────────────────────────────
   RECIPIENT RESOLUTION
   Returns a de-duplicated array of User._id strings.
───────────────────────────────────────────────────────────── */
async function resolveRecipients(targetType, targetData, schoolId) {
    let ids = [];

    switch (targetType) {

        case 'all_schools':
            // Super admin communicates with school admins only (they cascade to their school)
            ids = await User.find({ role: 'school_admin', isActive: true }).distinct('_id');
            break;

        case 'specific_school':
            // Super admin targets only the school admin(s) of that school
            ids = await User.find({ school: targetData.schoolId, role: 'school_admin', isActive: true }).distinct('_id');
            break;

        case 'all':
            ids = await User.find({
                school: schoolId,
                role: { $in: ['teacher', 'student', 'parent', 'school_admin'] },
                isActive: true,
            }).distinct('_id');
            break;

        case 'all_teachers':
            ids = await User.find({ school: schoolId, role: 'teacher', isActive: true }).distinct('_id');
            break;

        case 'all_students':
            ids = await User.find({ school: schoolId, role: 'student', isActive: true }).distinct('_id');
            break;

        case 'all_parents':
            ids = await User.find({ school: schoolId, role: 'parent', isActive: true }).distinct('_id');
            break;

        case 'class_students': {
            const sectionIds = await ClassSection.find({
                class: targetData.classId, school: schoolId,
            }).distinct('_id');
            ids = await StudentProfile.find({
                currentSection: { $in: sectionIds }, school: schoolId,
            }).distinct('user');
            break;
        }

        case 'class_parents': {
            const sectionIds = await ClassSection.find({
                class: targetData.classId, school: schoolId,
            }).distinct('_id');
            const studentParents = await StudentProfile.find({
                currentSection: { $in: sectionIds }, school: schoolId,
                parent: { $ne: null },
            }).distinct('parent');
            ids = studentParents;
            break;
        }

        case 'section_students':
            ids = await StudentProfile.find({
                currentSection: targetData.sectionId, school: schoolId,
            }).distinct('user');
            break;

        case 'section_parents':
            ids = await StudentProfile.find({
                currentSection: targetData.sectionId, school: schoolId,
                parent: { $ne: null },
            }).distinct('parent');
            break;

        case 'section_all': {
            const studentIds = await StudentProfile.find({
                currentSection: targetData.sectionId, school: schoolId,
            }).distinct('user');
            const parentIds = await StudentProfile.find({
                currentSection: targetData.sectionId, school: schoolId,
                parent: { $ne: null },
            }).distinct('parent');
            ids = [...studentIds, ...parentIds];
            break;
        }

        default:
            ids = [];
    }

    // De-duplicate across ObjectId/string mix
    const seen = new Set();
    return ids.filter(id => {
        const s = id.toString();
        if (seen.has(s)) return false;
        seen.add(s);
        return true;
    });
}

// GET :role/notifications/create
// Renders the create-notification form for all three sender roles.
const getCreateNotification = async (req, res) => {
    try {
        const role     = req.session.userRole;
        const schoolId = req.session.schoolId;

        let schools = [], classes = [], sections = [];

        if (role === 'super_admin') {
            schools = await School.find({ isActive: true }).sort({ name: 1 });

        } else if (role === 'school_admin') {
            [classes, sections] = await Promise.all([
                Class.find({ school: schoolId, status: 'active' }).sort({ classNumber: 1 }),
                ClassSection.find({ school: schoolId, status: 'active' })
                    .populate('class', 'className classNumber')
                    .sort({ sectionName: 1 }),
            ]);

        } else if (role === 'teacher') {
            // Teacher is restricted to their own section(s)
            sections = await ClassSection.find({
                $or: [
                    { classTeacher:    req.session.userId },
                    { substituteTeacher: req.session.userId },
                ],
                school: schoolId,
                status: 'active',
            }).populate('class', 'className classNumber');
        }

        res.render('notifications/create', {
            title: 'Send Notification',
            layout: 'layouts/main',
            schools,
            classes,
            sections,
            role,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load notification form.');
        res.redirect('back');
    }
};

// POST :role/notifications/send
const postSendNotification = async (req, res) => {
    try {
        const { title, body, targetType, targetSchoolId, targetClassId, targetSectionId } = req.body;
        const channelRaw = req.body.channels;
        const role       = req.session.userRole;
        const schoolId   = req.session.schoolId || null;
        const senderId   = req.session.userId;

        const channelArr = Array.isArray(channelRaw) ? channelRaw : (channelRaw ? [channelRaw] : []);
        const inApp      = channelArr.includes('inapp');
        const email      = channelArr.includes('email');

        if (!inApp && !email) {
            req.flash('error', 'Please select at least one channel (In-App or Email).');
            return res.redirect('back');
        }

        if (!title || !title.trim() || !body || !body.trim()) {
            req.flash('error', 'Title and body are required.');
            return res.redirect('back');
        }

        const targetData = {
            schoolId:  targetSchoolId  || null,
            classId:   targetClassId   || null,
            sectionId: targetSectionId || null,
        };

        const recipientIds = await resolveRecipients(targetType, targetData, schoolId);

        if (recipientIds.length === 0) {
            req.flash('error', 'No recipients found for the selected target. Check that students/teachers are assigned.');
            return res.redirect('back');
        }

        // Persist the notification record
        const notification = await Notification.create({
            title:       title.trim(),
            body:        body.trim(),
            sender:      senderId,
            senderRole:  role,
            school:      schoolId,
            channels:    { inApp, email },
            target: {
                type:    targetType,
                schools: targetSchoolId ? [targetSchoolId] : [],
                class:   targetClassId   || null,
                section: targetSectionId || null,
            },
            recipientCount: recipientIds.length,
        });

        // ── In-App receipts ────────────────────────────────────
        if (inApp) {
            const receipts = recipientIds.map(uid => ({
                notification: notification._id,
                recipient:    uid,
                school:       schoolId,
            }));
            // ordered:false — skip duplicates without aborting the whole batch
            await NotificationReceipt.insertMany(receipts, { ordered: false }).catch(() => {});

            // Push live SSE event to every connected recipient tab
            sseClients.pushMany(recipientIds, 'notification', {
                title:      notification.title,
                body:       notification.body,
                senderRole: notification.senderRole,
                createdAt:  notification.createdAt,
            });
        }

        // ── Email delivery ─────────────────────────────────────
        if (email) {
            const recipients = await User.find({ _id: { $in: recipientIds }, isActive: true }).select('name email');
            await Promise.allSettled(
                recipients.map(u =>
                    sendNotificationEmail({
                        to:            u.email,
                        recipientName: u.name,
                        title:         title.trim(),
                        body:          body.trim(),
                        senderRole:    role,
                    })
                )
            );
            await Notification.findByIdAndUpdate(notification._id, { emailSent: true });
        }

        req.flash('success', `Notification sent to ${recipientIds.length} recipient(s).`);

        const redirectMap = {
            super_admin:  '/super-admin/notifications',
            school_admin: '/admin/notifications',
            teacher:      '/teacher/notifications',
        };
        return res.redirect(redirectMap[role] || '/');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to send notification. Please try again.');
        return res.redirect('back');
    }
};

// GET :role/notifications — sent-notifications list per role
const getNotificationList = async (req, res) => {
    try {
        const role     = req.session.userRole;
        const schoolId = req.session.schoolId;

        let filter = {};
        let pageTitle = 'Sent Notifications';

        if (role === 'super_admin') {
            filter = { senderRole: 'super_admin' };
        } else if (role === 'school_admin') {
            filter = { school: schoolId, senderRole: { $in: ['school_admin', 'teacher'] } };
            pageTitle = 'School Notifications';
        } else {
            // teacher sees only their own
            filter = { sender: req.session.userId };
            pageTitle = 'My Sent Notifications';
        }

        const notifications = await Notification.find(filter)
            .populate('sender', 'name')
            .populate('target.class',   'className classNumber')
            .populate('target.section', 'sectionName sectionCode')
            .sort({ createdAt: -1 })
            .limit(200);

        res.render('notifications/list', {
            title: pageTitle,
            layout: 'layouts/main',
            notifications,
            role,
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Failed to load notifications.');
        res.redirect('back');
    }
};

/* ─────────────────────────────────────────────────────────────
   BELL ICON API  (shared across all roles)
───────────────────────────────────────────────────────────── */
const getInboxApi = async (req, res) => {
    try {
        const receipts = await NotificationReceipt.find({
            recipient: req.session.userId,
            isCleared: false,
        })
            .populate('notification', 'title body senderRole createdAt')
            .sort({ createdAt: -1 })
            .limit(25);

        const unreadCount = receipts.filter(r => !r.isRead).length;

        res.json({
            success: true,
            unreadCount,
            notifications: receipts.map(r => ({
                receiptId:      r._id,
                notificationId: r.notification?._id,
                title:          r.notification?.title,
                body:           r.notification?.body,
                senderRole:     r.notification?.senderRole,
                createdAt:      r.notification?.createdAt,
                isRead:         r.isRead,
            })),
        });
    } catch {
        res.json({ success: false, unreadCount: 0, notifications: [] });
    }
};

const postMarkAllRead = async (req, res) => {
    try {
        await NotificationReceipt.updateMany(
            { recipient: req.session.userId, isRead: false, isCleared: false },
            { isRead: true, readAt: new Date() }
        );
        res.json({ success: true });
    } catch {
        res.json({ success: false });
    }
};

const postMarkOneRead = async (req, res) => {
    try {
        await NotificationReceipt.findOneAndUpdate(
            { _id: req.params.receiptId, recipient: req.session.userId },
            { isRead: true, readAt: new Date() }
        );
        res.json({ success: true });
    } catch {
        res.json({ success: false });
    }
};

const postClearAll = async (req, res) => {
    try {
        await NotificationReceipt.updateMany(
            { recipient: req.session.userId, isCleared: false },
            { isCleared: true, isRead: true, clearedAt: new Date() }
        );
        res.json({ success: true });
    } catch {
        res.json({ success: false });
    }
};

const postClearOne = async (req, res) => {
    try {
        await NotificationReceipt.findOneAndUpdate(
            { _id: req.params.receiptId, recipient: req.session.userId },
            { isCleared: true, isRead: true, clearedAt: new Date() }
        );
        res.json({ success: true });
    } catch {
        res.json({ success: false });
    }
};

// AJAX — sections by class (used in create form dropdown)
const getSectionsByClass = async (req, res) => {
    try {
        const sections = await ClassSection.find({
            class:  req.params.classId,
            school: req.session.schoolId,
            status: 'active',
        }).select('sectionName sectionCode _id').sort({ sectionName: 1 });
        res.json({ success: true, sections });
    } catch {
        res.json({ success: false, sections: [] });
    }
};

/* ─────────────────────────────────────────────────────────────
   SSE ENDPOINT  GET /notifications/sse
   Keeps a persistent HTTP connection open per browser tab.
   Events pushed: "notification" | "ping" (keepalive)
───────────────────────────────────────────────────────────── */
const getSSE = (req, res) => {
    // Disable all buffering (critical for nginx + Node streaming)
    res.set({
        'Content-Type':      'text/event-stream',
        'Cache-Control':     'no-cache, no-transform',
        'Connection':        'keep-alive',
        'X-Accel-Buffering': 'no',   // nginx proxy_buffering off
    });
    res.flushHeaders();

    // Confirm connection to client
    res.write('event: connected\ndata: {"ok":true}\n\n');

    const userId = req.session.userId;
    sseClients.add(userId, res);

    // Heartbeat every 25 s — keeps the connection alive through nginx (60 s timeout)
    const ping = setInterval(() => {
        try { res.write(':ping\n\n'); } catch { clearInterval(ping); }
    }, 25000);

    req.on('close', () => {
        clearInterval(ping);
        sseClients.remove(userId, res);
    });
};

module.exports = {
    getCreateNotification,
    postSendNotification,
    getNotificationList,
    getInboxApi,
    postMarkAllRead,
    postMarkOneRead,
    postClearAll,
    postClearOne,
    getSectionsByClass,
    getSSE,
};
