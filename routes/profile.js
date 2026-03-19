const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const { isAuthenticated } = require('../middleware/auth');
const uploadImage = require('../middleware/uploadImage');

router.get('/', isAuthenticated, profileController.getProfile);
router.post('/update', isAuthenticated, uploadImage.single('profileImage'), profileController.postUpdateProfile);

module.exports = router;
