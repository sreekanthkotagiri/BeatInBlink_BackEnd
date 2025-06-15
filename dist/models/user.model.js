"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePassword = exports.createUser = exports.findUserByEmail = void 0;
const index_1 = require("../index");
const findUserByEmail = async (email) => {
    const res = await index_1.db.query('SELECT * FROM users WHERE email = $1', [email]);
    return res.rows[0];
};
exports.findUserByEmail = findUserByEmail;
const createUser = async (email, password, role) => {
    const res = await index_1.db.query('INSERT INTO users (email, password, role) VALUES ($1, $2, $3) RETURNING *', [email, password, role]);
    return res.rows[0];
};
exports.createUser = createUser;
const updatePassword = async (email, password) => {
    await index_1.db.query('UPDATE users SET password = $1 WHERE email = $2', [password, email]);
};
exports.updatePassword = updatePassword;
