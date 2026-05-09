require('dotenv').config();
const mongoose = require('mongoose');

async function dropIndex() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/school_management');
        console.log('Connected to DB');
        
        const ClassSection = require('./models/ClassSection');
        
        await ClassSection.collection.dropIndex('sectionCode_1');
        console.log('Index sectionCode_1 dropped successfully');
        
    } catch (err) {
        console.error('Error dropping index:', err.message);
        // Maybe it's named differently, let's list indexes
        try {
            const ClassSection = require('./models/ClassSection');
            const indexes = await ClassSection.collection.indexes();
            console.log('Current indexes:', indexes);
        } catch(e) {
            console.error('Could not list indexes:', e.message);
        }
    } finally {
        await mongoose.disconnect();
    }
}

dropIndex();
