require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const seed = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB...');

        const existing = await User.findOne({ role: 'super_admin' });
        if (existing) {
            console.log('✅ Super Admin already exists:');
            console.log('   Email:', existing.email);
            console.log('   Note: Use the password you set during first login.');
            process.exit(0);
        }

        const tempPassword = 'SuperAdmin@123';
        const hashedPassword = await bcrypt.hash(tempPassword, await bcrypt.genSalt(12));
        const admin = await User.create({
            name: 'Super Admin',
            email: 'superadmin@school.com',
            password: hashedPassword,
            role: 'super_admin',
            isFirstLogin: true,
        });

        console.log('\n🎉 Super Admin created successfully!\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('  Email    :', admin.email);
        console.log('  Password :', tempPassword);
        console.log('  URL      :', process.env.APP_URL + '/auth/login');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('\n⚠️  You will be asked to change your password on first login.\n');
        process.exit(0);
    } catch (err) {
        console.error('Seed error:', err.message);
        process.exit(1);
    }
};

seed();
