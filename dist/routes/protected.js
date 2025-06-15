"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const verifyToken_1 = require("../middleware/verifyToken");
const router = express_1.default.Router();
router.get('/dashboard', verifyToken_1.verifyToken, (req, res) => {
    const user = req.user;
    res.json({
        message: `Welcome ${user.role}!`,
        userId: user.userId
    });
});
exports.default = router;
