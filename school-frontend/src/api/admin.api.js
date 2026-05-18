import api from './axios';

export const getDashboard = () => api.get('/admin/dashboard');
export const getModules   = () => api.get('/admin/modules');

// School Settings
export const getSchoolSettings    = ()   => api.get('/admin/school-settings');
export const updateSchoolSettings = (fd) => api.put('/admin/school-settings', fd);
export const getSchoolConfig      = ()   => api.get('/profile/school-config');

// Users
export const getTeachers = (params) => api.get('/admin/teachers', { params });
export const getTeacher  = (id) => api.get(`/admin/teachers/${id}`);
export const createTeacher = (data) => api.post('/admin/teachers', data);
export const deleteTeacher = (id) => api.delete(`/admin/teachers/${id}`);
export const updateTeacher  = (id, data) => api.put(`/admin/users/${id}`, data);
export const toggleTeacher  = (id)       => api.patch(`/admin/users/${id}/toggle`);

export const checkEmail            = (email) => api.get('/admin/users/check-email', { params: { email } });
export const getClassesWithSections = (all) => api.get('/admin/classes-with-sections', all ? { params: { all: 'true' } } : {});
export const getStudents = (params) => api.get('/admin/students', { params });
export const getStudent  = (id) => api.get(`/admin/students/${id}`);
export const createStudent = (data) => api.post('/admin/students', data);
export const deleteStudent = (id) => api.delete(`/admin/students/${id}`);
export const parentLookup  = (q)      => api.get('/admin/students/parent-lookup', { params: { q } });
export const updateStudent  = (id, data) => api.put(`/admin/students/${id}`, data);
export const toggleStudent  = (id)       => api.patch(`/admin/users/${id}/toggle`);
export const bulkImportStudents        = (fd) => api.post('/admin/students/bulk', fd);
export const downloadStudentTemplate   = ()   => api.get('/admin/students/template', { responseType: 'arraybuffer' });

export const getAdmins = (params) => api.get('/admin/admins', { params });
export const createAdmin = (data) => api.post('/admin/admins', data);
export const deleteAdmin = (id) => api.delete(`/admin/admins/${id}`);

// Academic Years
export const getAcademicYears    = () => api.get('/admin/academic-years');
export const createAcademicYear  = (data) => api.post('/admin/academic-years', data);
export const updateAcademicYear  = (id, data) => api.put(`/admin/academic-years/${id}`, data);
export const deleteAcademicYear  = (id) => api.delete(`/admin/academic-years/${id}`);
export const setActiveYear       = (id) => api.patch(`/admin/academic-years/${id}/set-active`);

// Classes
export const getClasses     = (params) => api.get('/admin/classes', { params });
export const createClass    = (data) => api.post('/admin/classes', data);
export const getClassDetail = (id) => api.get(`/admin/classes/${id}`);
export const deleteClass          = (id) => api.delete(`/admin/classes/${id}`);
export const autoAssignStudents   = (academicYear) => api.post('/admin/classes/auto-assign', academicYear ? { academicYear } : {});
export const createSection        = (classId, data) => api.post(`/admin/classes/${classId}/sections`, data);

// Sections
export const getSectionDetail = (id) => api.get(`/admin/sections/${id}`);
export const updateSectionTeacher = (id, data) => api.put(`/admin/sections/${id}/teachers`, data);
export const deleteSection  = (id) => api.delete(`/admin/sections/${id}`);
export const getSectionSubjectTeachers  = (id) => api.get(`/admin/sections/${id}/subjects`);
export const assignStudentToSection     = (sectionId, studentId) => api.post(`/admin/sections/${sectionId}/assign-student`, { studentId });
export const removeStudentFromSection   = (sectionId, studentId) => api.delete(`/admin/sections/${sectionId}/remove-student`, { data: { studentId } });
export const assignSectionSubjectTeacher  = (id, data)                 => api.post(`/admin/sections/${id}/subjects/assign`, data);
export const removeSectionSubjectTeacher  = (id, subjectId, teacherId) => api.delete(`/admin/sections/${id}/subjects/${subjectId}/teachers/${teacherId}`);

// Subjects
export const getSubjects   = () => api.get('/admin/subjects');
export const createSubject = (data) => api.post('/admin/subjects', data);
export const updateSubject = (id, data) => api.put(`/admin/subjects/${id}`, data);
export const deleteSubject = (id) => api.delete(`/admin/subjects/${id}`);

// Leave
export const getLeaveTypes          = ()         => api.get('/admin/leave/types');
export const createLeaveType        = (data)     => api.post('/admin/leave/types', data);
export const updateLeaveType        = (id, data) => api.put(`/admin/leave/types/${id}`, data);
export const deleteLeaveType        = (id)       => api.delete(`/admin/leave/types/${id}`);
export const updateLeaveSettings    = (data)     => api.put('/admin/leave/settings', data);
export const getLeaveRequests       = (params)   => api.get('/admin/leave/requests', { params });
export const adminApplyLeave        = (data)     => api.post('/admin/leave/requests', data);
export const getTeacherLeaveBalance = (teacherId) => api.get('/admin/leave/balance', { params: { teacherId } });
export const approveLeave           = (id, data) => api.post(`/admin/leave/requests/${id}/approve`, data);
export const rejectLeave            = (id, data) => api.post(`/admin/leave/requests/${id}/reject`, data);
export const requestLeaveModification = (id, data) => api.post(`/admin/leave/requests/${id}/modification`, data);
export const getLeaveAllocations    = (params)   => api.get('/admin/leave/allocations', { params });
export const allocateLeave          = (data)     => api.post('/admin/leave/allocations', data);
export const runLeaveAccrual        = ()         => api.post('/admin/leave/accrual/run');
export const downloadAllocationTemplate = ()     => api.get('/admin/leave/allocations/template', { responseType: 'arraybuffer' });
export const bulkAllocateLeaveExcel = (fd)       => api.post('/admin/leave/allocations/excel', fd);
export const runCarryForward        = (data)     => api.post('/admin/leave/allocations/carry-forward', data);
export const exportLeaveRequests    = (params)   => api.get('/admin/leave/requests/export',    { params, responseType: 'arraybuffer' });
export const exportLeaveAllocations = (params)   => api.get('/admin/leave/allocations/export', { params, responseType: 'arraybuffer' });
export const getLeaveReports        = (params)   => api.get('/admin/leave/reports', { params });
export const exportLeaveReports     = (params)   => api.get('/admin/leave/reports/export', { params, responseType: 'arraybuffer' });

// Timetable
export const getSectionTimetable         = (sectionId, yearId) => api.get(`/admin/sections/${sectionId}/timetable`, { params: yearId ? { yearId } : {} });
export const saveTimetableStructure      = (sectionId, data)   => api.put(`/admin/sections/${sectionId}/timetable/structure`, data);
export const getSectionEntries           = (sectionId, yearId) => api.get(`/admin/sections/${sectionId}/timetable/entries`, { params: yearId ? { yearId } : {} });
export const saveTimetableEntries        = (sectionId, data)   => api.put(`/admin/sections/${sectionId}/timetable/entries`, data);
export const getTimetableTeachers        = (params)            => api.get('/admin/timetable/teachers', { params });
export const downloadSectionTimetable    = (sectionId, yearId) => api.get(`/admin/sections/${sectionId}/timetable/download`, { params: yearId ? { yearId } : {}, responseType: 'blob' });
export const downloadAllTimetables       = (params)            => api.get('/admin/timetable/download-all', { params, responseType: 'blob' });

// Documents
export const getDocuments  = (params) => api.get('/admin/documents', { params });
export const getDocument   = (id) => api.get(`/admin/documents/${id}`);
export const uploadDocument = (data) => api.post('/admin/documents', data);
export const deleteDocument = (id) => api.delete(`/admin/documents/${id}`);

// Holidays
export const getHolidays            = ()         => api.get('/admin/holidays');
export const getMyHolidays          = ()         => api.get('/admin/holidays/mine');
export const createHoliday          = (data)     => api.post('/admin/holidays', data);
export const updateHoliday          = (id, data) => api.put(`/admin/holidays/${id}`, data);
export const deleteHoliday          = (id)       => api.delete(`/admin/holidays/${id}`);
export const importHolidays         = (fd)       => api.post('/admin/holidays/import', fd).then(r => r.data ?? r);
export const exportHolidays         = ()         => api.get('/admin/holidays/export',   { responseType: 'arraybuffer' }).then(r => r.data ?? r);
export const downloadHolidayTemplate= ()         => api.get('/admin/holidays/template', { responseType: 'arraybuffer' }).then(r => r.data ?? r);
export const getHolidayAuditLog     = (params)   => api.get('/admin/holidays/audit', { params });

// Results
export const getFormalExams = () => api.get('/admin/results/exams');
export const createFormalExam = (data) => api.post('/admin/results/exams', data);
export const getFormalExam  = (id) => api.get(`/admin/results/exams/${id}`);
export const approveFormalExam = (id) => api.post(`/admin/results/exams/${id}/approve`);
export const rejectFormalExam  = (id, data) => api.post(`/admin/results/exams/${id}/reject`, data);

// Notifications
export const sendNotification = (data) => api.post('/admin/notifications/send', data);
export const getNotifications  = () => api.get('/admin/notifications');

// Attendance
export const getRegularizationRequests = (params) => api.get('/admin/regularization-requests', { params });
export const reviewRegularization = (data) => api.post('/admin/regularization-requests/review', data);
