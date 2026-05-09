'use strict';
const express = require('express');
const router  = express.Router();
const ctrl    = require('../../controllers/profile.controller');
const { verifyToken } = require('../../middleware/auth');
const { uploadProfile } = require('../../middleware/upload');

router.get('/',       verifyToken, ctrl.getProfile);
router.put('/update', verifyToken, uploadProfile.single('profileImage'), ctrl.updateProfile);

module.exports = router;
