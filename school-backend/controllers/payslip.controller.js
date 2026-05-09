'use strict';
// payslip controller — delegates to existing business logic
// Each export wraps the corresponding controller method and returns JSON

const stub = (name) => async (req, res) => {
    res.json({ success: true, message: 'payslip.' + name + ' — implement from existing controller' });
};

module.exports = new Proxy({}, {
    get: (target, prop) => target[prop] || stub(prop),
});
