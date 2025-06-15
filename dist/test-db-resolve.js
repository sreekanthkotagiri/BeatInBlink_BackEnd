"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
const dns_1 = __importDefault(require("dns"));
const util_1 = __importDefault(require("util"));
const lookup = util_1.default.promisify(dns_1.default.lookup);
async function handler(req, res) {
    try {
        const result = await lookup('db.qrxeudjdxnpyjwvygbrl.supabase.co');
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, resolved: result }));
    }
    catch (error) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: error.message }));
    }
}
