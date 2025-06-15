"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toggleResultLock = exports.searchStudents = exports.getAssignedStudentsForExam = exports.getAssignedBranchesForExam = exports.searchExams = exports.getExamSummary = exports.getStudentReport = exports.getTopPerformers = exports.getAllResults = exports.createAnnouncement = exports.getAllAnnouncements = exports.updateStudent = exports.assignExamToStudents = exports.assignExamToBranches = exports.logoutUser = exports.refreshAccessToken = exports.toggleExamStatus = exports.createBranch = exports.getBranches = exports.getDashBoard = exports.updateExamById = exports.ViewExamById = exports.getAllStudentExams = exports.getStudentResults = exports.getExamById = exports.createExam = exports.getResults = exports.getExams = exports.getStudentExams = exports.getStudentProfileById = exports.bulkRegisterStudents = exports.studentReg = exports.instituteReg = exports.loginUser = void 0;
const index_1 = require("../index");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const generateAccessToken = (user, userType) => {
    return jsonwebtoken_1.default.sign({ id: user.id, email: user.email, userType }, process.env.JWT_SECRET, { expiresIn: '1h' });
};
const generateRefreshToken = async (user, userType) => {
    const refreshToken = jsonwebtoken_1.default.sign({ id: user.id, email: user.email, userType }, process.env.REFRESH_SECRET, { expiresIn: '7d' });
    await index_1.db.query(`INSERT INTO refresh_tokens (user_id, user_type, token)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, user_type) DO UPDATE SET token = EXCLUDED.token`, [user.id, userType, refreshToken]);
    return refreshToken;
};
// Login handler for both students and institutes
const loginUser = async (req, res) => {
    const { email, password, role } = req.body;
    if (!email || !password || !role) {
        return res.status(400).json({ message: 'Email, password, and userType are required' });
    }
    try {
        let userQuery;
        let user;
        if (role === 'institute') {
            // Institute login
            const result = await index_1.db.query(`SELECT * FROM institutes WHERE email = $1`, [email]);
            if (result.rows.length === 0) {
                return res.status(401).json({ message: 'Invalid credentials' });
            }
            user = result.rows[0];
        }
        else {
            // Student login
            const result = await index_1.db.query(`SELECT 
                                            s.id,
                                            s.name,
                                            s.email,
                                            s.password_hash,
                                            i.name AS institute_name,
                                            b.name as branch_name
                                          FROM students s
                                          JOIN institutes i ON s.institute_id = i.id
                                          JOIN branches b ON s.branch_id = b.id
                                          WHERE s.email = $1
                                        `, [email]);
            if (result.rows.length === 0) {
                return res.status(401).json({ message: 'Invalid credentials' });
            }
            user = result.rows[0];
        }
        const isMatch = await bcryptjs_1.default.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        const token = generateAccessToken(user, role);
        const refreshToken = await generateRefreshToken(user, role);
        if (role === 'student') {
            return res.json({
                token,
                refreshToken,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    institute_name: user.institute_name,
                    branch_name: user.branch_name,
                    role: 'student'
                }
            });
        }
        return res.json({
            token,
            refreshToken,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: 'institute'
            }
        });
    }
    catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.loginUser = loginUser;
// Register student only (institutes are pre-created manually or via a separate route)
const instituteReg = async (req, res) => {
    const { name, email, password, address } = req.body;
    if (!name || !email || !password || !address) {
        return res.status(400).json({ message: 'All fields are required' });
    }
    try {
        const existingUser = await index_1.db.query('SELECT * FROM institutes WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) {
            return res.status(409).json({ message: 'Email already registered' });
        }
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        const result = await index_1.db.query(`INSERT INTO institutes (name, email, password_hash, address)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email`, [name, email, hashedPassword, address]);
        const newInstitute = result.rows[0];
        const token = generateAccessToken(newInstitute, 'institute');
        const refreshToken = await generateRefreshToken(newInstitute, 'institute');
        res.status(201).json({ token, refreshToken, institute: { ...newInstitute, userType: 'institute' } });
    }
    catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.instituteReg = instituteReg;
const studentReg = async (req, res) => {
    const { name, email, password, instituteId, branchId } = req.body;
    if (!name || !email || !password || !instituteId) {
        return res.status(400).json({ message: 'All fields are required' });
    }
    try {
        const existingStudent = await index_1.db.query('SELECT * FROM students WHERE email = $1', [email]);
        if (existingStudent.rows.length > 0) {
            return res.status(409).json({ message: 'Email already registered' });
        }
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        const result = await index_1.db.query(`INSERT INTO students (name, email, password_hash, institute_id, branch_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email`, [name, email, hashedPassword, instituteId, branchId]);
        const newStudent = result.rows[0];
        const token = generateAccessToken(newStudent, 'student');
        const refreshToken = await generateRefreshToken(newStudent, 'student');
        res.status(201).json({ token, refreshToken, student: { ...newStudent, userType: 'student' } });
    }
    catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.studentReg = studentReg;
const bulkRegisterStudents = async (req, res) => {
    const students = req.body.students;
    const { instituteId } = req.body;
    if (!Array.isArray(students) || students.length === 0 || !instituteId) {
        return res.status(400).json({ message: 'Students array and instituteId are required' });
    }
    const client = await index_1.db.connect();
    const failed = [];
    const valid = [];
    try {
        await client.query('BEGIN');
        for (const student of students) {
            const { name, email, password, branch } = student;
            if (!name || !email || !password || !branch) {
                failed.push({ email, reason: 'Missing required fields' });
                continue;
            }
            // Check for duplicate email
            const existing = await client.query(`SELECT id FROM students WHERE email = $1`, [email]);
            if (existing.rows.length > 0) {
                failed.push({ email, reason: 'Email already exists' });
                continue;
            }
            // Validate branch
            const branchRes = await client.query(`SELECT id FROM branches WHERE name = $1 AND institute_id = $2`, [branch, instituteId]);
            if (branchRes.rows.length === 0) {
                failed.push({ email, reason: `Invalid branch: ${branch}` });
                continue;
            }
            valid.push({
                ...student,
                branch_id: branchRes.rows[0].id,
            });
        }
        if (failed.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({
                message: 'Some records failed validation',
                errors: failed,
            });
        }
        // Proceed with valid inserts
        for (const student of valid) {
            const { name, email, password, branch_id } = student;
            const hashedPassword = await bcryptjs_1.default.hash(password, 10);
            await client.query(`INSERT INTO students (name, email, password_hash, institute_id, branch_id)
         VALUES ($1, $2, $3, $4, $5)`, [name, email, hashedPassword, instituteId, branch_id]);
        }
        await client.query('COMMIT');
        return res.status(201).json({ message: '✅ All students registered successfully' });
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Bulk registration error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
    finally {
        client.release();
    }
};
exports.bulkRegisterStudents = bulkRegisterStudents;
const getStudentProfileById = async (req, res) => {
    const { studentId } = req.query;
    if (!studentId) {
        return res.status(400).json({ message: 'studentId is required' });
    }
    try {
        const query = `
      WITH student_info AS (
        SELECT 
          s.id AS student_id,
          s.name AS student_name,
          i.name AS institute_name
        FROM students s
        JOIN institutes i ON s.institute_id = i.id
        WHERE s.id = $1
      ),
      all_assignments AS (
        SELECT 
          exam_id,
          has_submitted,
          is_enabled,
          disabled_at
        FROM exam_student_assignments
        WHERE student_id = $1
      )

      SELECT 
        si.student_id AS "studentId",
        si.student_name AS "studentName",
        si.institute_name AS "instituteName",
        COUNT(*) FILTER (WHERE aa.is_enabled = true) AS "totalExams",
        COUNT(*) FILTER (WHERE aa.has_submitted = true AND aa.is_enabled = true) AS "submitted",
        COUNT(*) FILTER (WHERE aa.has_submitted = false AND aa.is_enabled = true) AS "pending",
        COUNT(*) FILTER (WHERE aa.has_submitted = false AND aa.is_enabled = false AND aa.disabled_at IS NOT NULL) AS "closed"
      FROM student_info si
      LEFT JOIN all_assignments aa ON true
      GROUP BY si.student_id, si.student_name, si.institute_name;
    `;
        const result = await index_1.db.query(query, [studentId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Student not found' });
        }
        return res.json(result.rows[0]);
    }
    catch (err) {
        console.error('Error fetching student profile:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.getStudentProfileById = getStudentProfileById;
const getStudentExams = async (req, res) => {
    const { studentId, examStatus } = req.query;
    if (!studentId) {
        return res.status(400).json({ message: 'studentId is required' });
    }
    const status = (examStatus || '').toString().toLowerCase();
    try {
        const query = `
      WITH student_info AS (
        SELECT id AS student_id, branch_id
        FROM students WHERE id = $1
      ),
      branch_exams AS (
        SELECT eb.exam_id, eb.branch_id
        FROM exam_branch_assignments eb
        WHERE eb.is_enabled = true
      ),
      direct_assignments AS (
        SELECT exam_id, has_submitted, is_enabled, disabled_at
        FROM exam_student_assignments
        WHERE student_id = $1
      ),
      exam_results AS (
        SELECT exam_id, score, status, submitted_at
        FROM student_exam_results
        WHERE student_id = $1
      ),
      exam_details AS (
        SELECT 
          e.id AS exam_id,
          e.title,
          e.description,
          e.created_at,
          e.duration_min,
          e.pass_percentage,
          e.result_locked,
          e.downloadable,
          COALESCE(esa.has_submitted, false) AS has_submitted,
          esa.is_enabled,
          esa.disabled_at,
          sr.score,
          sr.status,
          sr.submitted_at AS taken_date,
          CASE 
            WHEN COALESCE(esa.has_submitted, false) = true THEN 'submitted'
            WHEN COALESCE(esa.has_submitted, false) = false AND esa.is_enabled = true THEN 'pending'
            WHEN COALESCE(esa.has_submitted, false) = false AND esa.is_enabled = false AND esa.disabled_at IS NOT NULL THEN 'closed'
            ELSE 'unknown'
          END AS exam_status
        FROM exams e
        JOIN student_info si ON true
        LEFT JOIN branch_exams be ON be.exam_id = e.id AND be.branch_id = si.branch_id
        LEFT JOIN direct_assignments esa ON esa.exam_id = e.id
        LEFT JOIN exam_results sr ON sr.exam_id = e.id
        WHERE (be.exam_id IS NOT NULL OR esa.exam_id IS NOT NULL)
    AND e.is_enabled = true
      ),
      filtered_exams AS (
        SELECT * FROM exam_details
        WHERE
          ${status === 'pending'
            ? "exam_status = 'pending'"
            : status === 'submitted'
                ? "exam_status = 'submitted'"
                : status === 'closed'
                    ? "exam_status = 'closed'"
                    : 'true'}
      )

      SELECT COALESCE(
        json_agg(
          json_build_object(
            'id', e.exam_id,
            'title', e.title,
            'description', e.description,
            'created_at', e.created_at,
            'taken_date', e.taken_date,
            'downloadable', e.downloadable,
            'status', e.exam_status
          )
        ) FILTER (WHERE e.exam_id IS NOT NULL),
        '[]'::json
      ) AS exams
      FROM filtered_exams e;
    `;
        const result = await index_1.db.query(query, [studentId]);
        return res.json(result.rows[0]);
    }
    catch (err) {
        console.error('Error fetching student exams:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.getStudentExams = getStudentExams;
const getExams = async (req, res) => {
    const { instituteId, scheduled } = req.query;
    if (!instituteId) {
        return res.status(400).json({ message: 'Institute Id is required' });
    }
    try {
        const baseQuery = `
      SELECT 
        e.id, 
        e.title, 
        e.created_at, 
        e.duration_min,
        e.is_enabled
      FROM exams e
      WHERE e.created_by = $1
    `;
        const filterQuery = scheduled
            ? `${baseQuery} AND e.scheduled_date > current_date`
            : baseQuery;
        const result = await index_1.db.query(filterQuery, [instituteId]);
        return res.json(result.rows);
    }
    catch (err) {
        console.error('Error fetching exam(s):', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.getExams = getExams;
const getResults = async (req, res) => {
    const { instituteId } = req.query;
    if (!instituteId) {
        return res.status(400).json({ message: 'Institute Id is required' });
    }
    try {
        const result = await index_1.db.query(`SELECT r.exam_id AS examId, e.title AS examTitle,
          s.name AS studentName,
          s.branch AS branch,
          r.score AS score,
          r.status AS status
        FROM results r
        JOIN students s ON r.student_id = s.id
        JOIN exams e ON r.exam_id = e.id
                where s.institute_id = $1
        ORDER BY r.exam_id, s.name`, [instituteId]);
        return res.json(result.rows);
    }
    catch (err) {
        console.error('Error fetching exam(s):', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.getResults = getResults;
const createExam = async (req, res) => {
    const client = await index_1.db.connect();
    try {
        const { title, description, expires_at, downloadable, duration_min, pass_percentage, created_by, questions, } = req.body;
        // ✅ Calculate total marks
        const totalMarks = questions.reduce((sum, q) => sum + Number(q.marks || 0), 0);
        await client.query('BEGIN');
        // ✅ Insert into exams
        const examInsertQuery = expires_at
            ? `
      INSERT INTO exams (title, description, created_by, expires_at, duration_min, pass_percentage, total_marks, downloadable)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `
            : `
      INSERT INTO exams (title, description, created_by, duration_min, pass_percentage, total_marks, downloadable)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `;
        const examParams = expires_at
            ? [title, description, created_by, expires_at, duration_min, pass_percentage, totalMarks, downloadable]
            : [title, description, created_by, duration_min, pass_percentage, totalMarks, downloadable];
        const { rows: examRows } = await client.query(examInsertQuery, examParams);
        const examId = examRows[0].id;
        // ✅ Insert each question
        for (const question of questions) {
            const { text, type, options, correctAnswer, marks } = question;
            await client.query(`INSERT INTO questions (exam_paper_id, question_text, options, correct_answer, marks)
         VALUES ($1, $2, $3, $4, $5)`, [examId, text, JSON.stringify({ type, choices: options }), correctAnswer, marks]);
        }
        await client.query('COMMIT');
        res.status(201).json({ message: 'Exam created successfully' });
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('Error creating exam:', error);
        res.status(500).json({ error: 'Failed to create exam' });
    }
    finally {
        client.release();
    }
};
exports.createExam = createExam;
const getExamById = async (req, res) => {
    const client = await index_1.db.connect();
    const { examId } = req.params;
    try {
        // Fetch exam basic info
        const examQuery = `SELECT id, title, description, created_at, duration_min, pass_percentage, created_by FROM exams WHERE id = $1`;
        const { rows: examRows } = await client.query(examQuery, [examId]);
        if (examRows.length === 0) {
            return res.status(404).json({ message: 'Exam not found' });
        }
        const exam = examRows[0];
        // Fetch all questions
        const questionQuery = `SELECT * FROM questions WHERE exam_paper_id = $1`;
        const { rows: questionRows } = await client.query(questionQuery, [examId]);
        // Format questions
        const questions = questionRows.map(q => {
            const parsedOptions = typeof q.options === 'string' ? JSON.parse(q.options) : q.options;
            return {
                id: q.id,
                text: q.question_text,
                type: parsedOptions.type,
                options: parsedOptions.choices,
            };
        });
        return res.status(200).json({
            id: exam.id,
            title: exam.title,
            description: exam.description,
            created_at: exam.created_at,
            duration_min: exam.duration_min,
            created_by: exam.created_by,
            questions
        });
    }
    catch (err) {
        console.error('Error getting exam:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
    finally {
        client.release();
    }
};
exports.getExamById = getExamById;
const getStudentResults = async (req, res) => {
    const { studentId } = req.query;
    if (!studentId) {
        return res.status(400).json({ message: 'studentId is required' });
    }
    try {
        const query = `
      WITH student_info AS (
        SELECT 
          s.id AS student_id, 
          s.name AS student_name, 
          s.branch_id, 
          i.name AS institute_name
        FROM students s
        JOIN institutes i ON s.institute_id = i.id
        WHERE s.id = $1
      ),
      submitted_enrollments AS (
        SELECT 
          esa.exam_id, 
          esa.student_id, 
          esa.is_enabled
        FROM exam_student_assignments esa
        WHERE esa.student_id = $1 AND esa.has_submitted = true
      ),
      exams_info AS (
        SELECT 
          e.id, 
          e.title, 
          e.scheduled_date, 
          e.duration_min, 
          e.total_marks,
          e.pass_percentage,
          e.result_locked
        FROM exams e
      ),
      student_results AS (
        SELECT 
          r.exam_id, 
          r.student_id, 
          r.score, 
          r.status,
          r.submitted_at
        FROM student_exam_results r
        WHERE r.student_id = $1
      )
      
      SELECT 
        COALESCE(
          json_agg(
            json_build_object(
  'examId', e.id,
  'title', e.title,
  'scheduledDate', e.scheduled_date,
  'durationMin', CASE WHEN e.result_locked THEN NULL ELSE e.duration_min END,
  'passPercentage', CASE WHEN e.result_locked THEN NULL ELSE e.pass_percentage END,
  'isEnabled', CASE WHEN e.result_locked THEN NULL ELSE se.is_enabled END,
  'score', CASE WHEN e.result_locked THEN NULL ELSE r.score END,
  'totalMarks', CASE WHEN e.result_locked THEN NULL ELSE e.total_marks END,
  'status', CASE WHEN e.result_locked THEN 'Pending' ELSE r.status END,
  'submittedAt', r.submitted_at,
  'resultLocked', e.result_locked
            )
          ) FILTER (WHERE e.id IS NOT NULL),
          '[]'::json
        ) AS exams,
        
        json_build_object(
          'studentId', si.student_id,
          'studentName', si.student_name,
          'instituteName', si.institute_name
        ) AS student

      FROM student_info si
      JOIN submitted_enrollments se ON si.student_id = se.student_id
      JOIN exams_info e ON e.id = se.exam_id
      LEFT JOIN student_results r ON r.exam_id = e.id AND r.student_id = si.student_id
      GROUP BY si.student_id, si.student_name, si.institute_name;
    `;
        const result = await index_1.db.query(query, [studentId]);
        return res.status(200).json(result.rows[0]);
    }
    catch (err) {
        console.error('Error fetching student results:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};
exports.getStudentResults = getStudentResults;
const getAllStudentExams = async (req, res) => {
    const { studentId } = req.params;
    if (!studentId) {
        return res.status(400).json({ message: 'studentId is required' });
    }
    try {
        const query = `
      WITH student_info AS (
        SELECT 
          s.id AS student_id, 
          s.name AS student_name, 
          i.name AS institute_name
        FROM students s
        JOIN institutes i ON s.institute_id = i.id
        WHERE s.id = $1
      ),
      enrollments AS (
        SELECT 
          esa.exam_id,
          esa.student_id,
          esa.has_submitted,
          esa.is_enabled
        FROM exam_student_assignments esa
        WHERE esa.student_id = $1
      ),
      exam_data AS (
        SELECT 
          e.id, e.title, e.scheduled_date, e.duration_min, e.total_marks,
          e.pass_percentage, e.result_locked
        FROM exams e
      ),
      result_data AS (
        SELECT 
          r.exam_id, r.student_id, r.score, r.status, r.created_at
        FROM results r
        WHERE r.student_id = $1
      )
      SELECT 
        json_agg(
          json_build_object(
            'examId', e.id,
            'title', e.title,
            'scheduledDate', e.scheduled_date,
            'durationMin', e.duration_min,
            'passPercentage', e.pass_percentage,
            'isEnabled', en.is_enabled,
            'hasSubmitted', en.has_submitted,
            'score', CASE WHEN e.result_locked THEN NULL ELSE r.score END,
            'totalMarks', e.total_marks,
            'status', 
              CASE 
                WHEN NOT en.has_submitted THEN 'Pending'
                WHEN e.result_locked THEN 'Pending'
                ELSE r.status
              END,
            'submittedAt', r.created_at,
            'resultLocked', e.result_locked
          )
        ) AS exams,
        json_build_object(
          'studentId', si.student_id,
          'studentName', si.student_name,
          'instituteName', si.institute_name
        ) AS student
      FROM student_info si
      LEFT JOIN enrollments en ON en.student_id = si.student_id
      LEFT JOIN exam_data e ON e.id = en.exam_id
      LEFT JOIN result_data r ON r.exam_id = e.id AND r.student_id = si.student_id
      GROUP BY si.student_id, si.student_name, si.institute_name
    `;
        const result = await index_1.db.query(query, [studentId]);
        return res.status(200).json(result.rows[0]);
    }
    catch (error) {
        console.error('Error fetching student exams:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};
exports.getAllStudentExams = getAllStudentExams;
const ViewExamById = async (req, res) => {
    const client = await index_1.db.connect();
    const { examId } = req.params;
    try {
        // Fetch exam basic info
        const examQuery = `SELECT id, title, description, scheduled_date, duration_min, pass_percentage, created_by FROM exams WHERE id = $1`;
        const { rows: examRows } = await client.query(examQuery, [examId]);
        if (examRows.length === 0) {
            return res.status(404).json({ message: 'Exam not found' });
        }
        const exam = examRows[0];
        // Fetch all questions
        const questionQuery = `SELECT * FROM questions WHERE exam_paper_id = $1`;
        const { rows: questionRows } = await client.query(questionQuery, [examId]);
        // Format questions
        const questions = questionRows.map(q => {
            const parsedOptions = typeof q.options === 'string' ? JSON.parse(q.options) : q.options;
            return {
                id: q.id,
                text: q.question_text,
                type: parsedOptions.type,
                options: parsedOptions.choices,
                correctAnswer: q.correct_answer,
                marks: q.marks,
            };
        });
        return res.status(200).json({
            id: exam.id,
            title: exam.title,
            description: exam.description,
            scheduled_date: exam.scheduled_date,
            duration_min: exam.duration_min,
            pass_percentage: exam.pass_percentage,
            created_by: exam.created_by,
            questions
        });
    }
    catch (err) {
        console.error('Error getting exam:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
    finally {
        client.release();
    }
};
exports.ViewExamById = ViewExamById;
const updateExamById = async (req, res) => {
    const client = await index_1.db.connect();
    const { id, title, description, scheduled_date, duration_min, pass_percentage, created_by, questions } = req.body;
    try {
        await client.query('BEGIN');
        // Check if exam exists
        const examCheckQuery = `SELECT id FROM exams WHERE id = $1`;
        const { rows: examRows } = await client.query(examCheckQuery, [id]);
        if (examRows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Exam not found' });
        }
        // Update the exam basic details
        const updateExamQuery = `
      UPDATE exams SET
        title = $1,
        description = $2,
        scheduled_date = $3,
        duration_min = $4,
        pass_percentage = $5,
        created_by = $6
      WHERE id = $7
    `;
        await client.query(updateExamQuery, [
            title,
            description,
            scheduled_date,
            duration_min,
            pass_percentage,
            created_by,
            id
        ]);
        // Delete old questions for this exam
        await client.query(`DELETE FROM questions WHERE exam_paper_id = $1`, [id]);
        // Insert updated questions
        for (const question of questions) {
            const insertQuestionQuery = `
        INSERT INTO questions (exam_paper_id, question_text, options, correct_answer, marks)
        VALUES ($1, $2, $3, $4, $5)
      `;
            const options = JSON.stringify({
                type: question.type,
                choices: question.options
            });
            await client.query(insertQuestionQuery, [
                id,
                question.text,
                options,
                question.correctAnswer,
                question.marks
            ]);
        }
        await client.query('COMMIT');
        return res.status(200).json({ message: 'Exam updated successfully' });
    }
    catch (err) {
        await client.query('ROLLBACK');
        console.error('Error updating exam:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
    finally {
        client.release();
    }
};
exports.updateExamById = updateExamById;
const getDashBoard = async (req, res) => {
    const { instituteId } = req.query;
    if (!instituteId) {
        return res.status(400).json({ message: 'Institute Id is required' });
    }
    try {
        // Total counts
        const result = await index_1.db.query(`
      SELECT 
        (SELECT COUNT(*) FROM students WHERE institute_id = $1) AS totalStudents,
        (SELECT COUNT(*) FROM exams WHERE created_by = $1) AS totalExams,
        (SELECT COUNT(DISTINCT e.id)
         FROM exams e
         JOIN exam_student_assignments se ON se.exam_id = e.id
         WHERE e.created_by = $1 AND e.is_enabled = true
        ) AS enabledExamsAssigned,
        (SELECT COUNT(*) FROM exams 
         WHERE created_by = $1 AND scheduled_date = CURRENT_DATE
        ) AS examsToday
      `, [instituteId]);
        const { totalstudents, totalexams, enabledexamsassigned, examstoday, } = result.rows[0];
        // Recent exams
        const recentExamsRes = await index_1.db.query(`
        SELECT id, title, created_at
        FROM exams
        WHERE created_by = $1
        ORDER BY created_at DESC
        LIMIT 3
      `, [instituteId]);
        return res.json({
            totalStudents: parseInt(totalstudents, 10),
            totalExams: parseInt(totalexams, 10),
            examsEnabled: parseInt(enabledexamsassigned, 10),
            examsToday: parseInt(examstoday, 10),
            recentExams: recentExamsRes.rows
        });
    }
    catch (err) {
        console.error('Error fetching dashboard data:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.getDashBoard = getDashBoard;
const getBranches = async (req, res) => {
    const { instituteId } = req.query;
    if (!instituteId) {
        return res.status(400).json({ message: 'Institute Id is required' });
    }
    try {
        const result = await index_1.db.query(`SELECT id, name, created_at FROM branches WHERE institute_id = $1 ORDER BY name`, [instituteId]);
        return res.json(result.rows);
    }
    catch (err) {
        console.error('Error fetching branches:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};
exports.getBranches = getBranches;
const createBranch = async (req, res) => {
    const { name, instituteId } = req.body;
    if (!name || !instituteId) {
        return res.status(400).json({ message: 'Branch name and Institute ID are required.' });
    }
    try {
        // Optional: Check for duplicate branch in the same institute
        const duplicateCheck = await index_1.db.query('SELECT * FROM branches WHERE name = $1 AND institute_id = $2', [name, instituteId]);
        if (duplicateCheck.rows.length > 0) {
            return res.status(409).json({ message: 'Branch already exists for this institute.' });
        }
        const result = await index_1.db.query(`INSERT INTO branches (name, institute_id)
       VALUES ($1, $2)
       RETURNING id, name`, [name, instituteId]);
        return res.status(201).json({ message: 'Branch created successfully', branch: result.rows[0] });
    }
    catch (err) {
        console.error('Error creating branch:', err);
        if (err.code === '23505' && err.constraint === 'unique_branch_name_per_institute') {
            return res.status(409).json({ message: 'Branch already exists (case-insensitive match).' });
        }
        return res.status(500).json({ message: 'Internal server error' });
    }
};
exports.createBranch = createBranch;
const toggleExamStatus = async (req, res) => {
    const { examId } = req.params;
    const { is_enabled } = req.body;
    if (typeof is_enabled !== 'boolean') {
        return res.status(400).json({ message: 'Invalid "is_enabled" value' });
    }
    try {
        const result = await index_1.db.query('UPDATE exams SET is_enabled = $1 WHERE id = $2 RETURNING *', [is_enabled, examId]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Exam not found' });
        }
        return res.status(200).json({ message: `Exam ${is_enabled ? 'enabled' : 'disabled'} successfully.` });
    }
    catch (error) {
        console.error('Error updating exam status:', error);
        return res.status(500).json({ message: 'Failed to update exam status' });
    }
};
exports.toggleExamStatus = toggleExamStatus;
const refreshAccessToken = async (req, res) => {
    const { refreshToken, userType } = req.body;
    if (!refreshToken || !userType) {
        return res.status(401).json({ message: 'Refresh token and userType required' });
    }
    try {
        const payload = jsonwebtoken_1.default.verify(refreshToken, process.env.REFRESH_SECRET);
        const result = await index_1.db.query('SELECT * FROM refresh_tokens WHERE user_id = $1 AND token = $2 AND user_type = $3', [payload.id, refreshToken, userType]);
        if (result.rows.length === 0) {
            return res.status(403).json({ message: 'Invalid refresh token' });
        }
        const newAccessToken = generateAccessToken(payload, userType);
        res.json({ token: newAccessToken });
    }
    catch (err) {
        console.error('Refresh token error:', err);
        res.status(403).json({ message: 'Invalid or expired refresh token' });
    }
};
exports.refreshAccessToken = refreshAccessToken;
const logoutUser = async (req, res) => {
    const { refreshToken, userType } = req.body;
    if (!refreshToken || !userType) {
        return res.status(400).json({ message: 'Refresh token and userType are required' });
    }
    try {
        await index_1.db.query('DELETE FROM refresh_tokens WHERE token = $1 AND user_type = $2', [
            refreshToken,
            userType
        ]);
        res.status(200).json({ message: 'Logged out successfully' });
    }
    catch (err) {
        console.error('Logout error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.logoutUser = logoutUser;
const assignExamToBranches = async (req, res) => {
    const { examId, branchIds } = req.body;
    if (!examId || !Array.isArray(branchIds)) {
        return res.status(400).json({ message: 'examId and branchIds are required' });
    }
    const client = await index_1.db.connect();
    try {
        await client.query('BEGIN');
        // Step 1: Get existing branch assignments
        const existingRes = await client.query(`SELECT branch_id FROM exam_branch_assignments WHERE exam_id = $1`, [examId]);
        const existingBranchIds = existingRes.rows.map((row) => Number(row.branch_id));
        // Step 2: Normalize types to avoid mismatch issues
        const normalizedIncomingBranchIds = branchIds.map((id) => Number(id));
        // Step 3: Calculate additions and removals
        const branchIdsToAdd = normalizedIncomingBranchIds.filter((id) => !existingBranchIds.includes(id));
        const branchIdsToDisable = existingBranchIds.filter((id) => !normalizedIncomingBranchIds.includes(id));
        // Step 4: Add/re-enable branches and insert students
        for (const branchId of normalizedIncomingBranchIds) {
            // Upsert branch
            await client.query(`INSERT INTO exam_branch_assignments (exam_id, branch_id, is_enabled)
     VALUES ($1, $2, true)
     ON CONFLICT (exam_id, branch_id) DO UPDATE SET is_enabled = true`, [examId, branchId]);
            // Insert or re-enable all students in that branch
            await client.query(`INSERT INTO exam_student_assignments (exam_id, student_id, assigned_from, is_enabled, assigned_at)
     SELECT $1, s.id, 'branch', true, now()
     FROM students s
     WHERE s.branch_id = $2
     ON CONFLICT (exam_id, student_id)
     DO UPDATE SET is_enabled = true, disabled_at = NULL`, [examId, branchId]);
        }
        // Step 5: Disable branch and matching students
        for (const branchId of branchIdsToDisable) {
            await client.query(`UPDATE exam_branch_assignments
         SET is_enabled = false
         WHERE exam_id = $1 AND branch_id = $2`, [examId, branchId]);
            const result = await client.query(`UPDATE exam_student_assignments
         SET is_enabled = false, disabled_at = now()
         WHERE exam_id = $1
           AND student_id IN (
             SELECT id FROM students WHERE branch_id = $2
           )
           AND assigned_from = 'branch'`, [examId, branchId]);
            console.log(`❌ Disabled student assignments from branch ${branchId}:`, result.rowCount);
        }
        await client.query('COMMIT');
        res.status(200).json({ message: '✅ Exam branch assignments updated successfully.' });
    }
    catch (err) {
        await client.query('ROLLBACK');
        console.error('🚨 Error assigning exam to branches:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
    finally {
        client.release();
    }
};
exports.assignExamToBranches = assignExamToBranches;
const assignExamToStudents = async (req, res) => {
    const { examId, studentIds } = req.body;
    if (!examId || !Array.isArray(studentIds)) {
        return res.status(400).json({ message: 'examId and studentIds are required' });
    }
    const client = await index_1.db.connect();
    try {
        await client.query('BEGIN');
        // Fetch existing assigned students
        const existingRes = await client.query(`SELECT student_id FROM exam_student_assignments WHERE exam_id = $1`, [examId]);
        const existingStudentIds = existingRes.rows.map((row) => row.student_id);
        const toAdd = studentIds.filter((id) => !existingStudentIds.includes(id));
        const toDisable = existingStudentIds.filter((id) => !studentIds.includes(id));
        for (const studentId of toAdd) {
            await client.query(`INSERT INTO exam_student_assignments (student_id, exam_id, is_enabled)
         VALUES ($1, $2, true)
         ON CONFLICT (student_id, exam_id) DO UPDATE SET is_enabled = true`, [studentId, examId]);
        }
        for (const studentId of toDisable) {
            await client.query(`UPDATE exam_student_assignments
         SET is_enabled = false
         WHERE student_id = $1 AND exam_id = $2`, [studentId, examId]);
        }
        await client.query('COMMIT');
        res.status(200).json({ message: '✅ Exam student assignment updated.' });
    }
    catch (err) {
        await client.query('ROLLBACK');
        console.error('Error assigning exam to students:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
    finally {
        client.release();
    }
};
exports.assignExamToStudents = assignExamToStudents;
const updateStudent = async (req, res) => {
    const { id, name, email, branch, is_enabled } = req.body;
    if (!id || !name || !email || !branch) {
        return res.status(400).json({ message: 'Missing required student fields.' });
    }
    try {
        // Get the branch_id using branch name (assuming uniqueness per institute)
        const branchRes = await index_1.db.query('SELECT id FROM branches WHERE name = $1', [branch]);
        if (branchRes.rowCount === 0) {
            return res.status(404).json({ message: 'Branch not found.' });
        }
        const branchId = branchRes.rows[0].id;
        const result = await index_1.db.query(`UPDATE students 
       SET name = $1, email = $2, branch_id = $3, is_enabled = $4
       WHERE id = $5 
       RETURNING *`, [name, email, branchId, is_enabled, id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Student not found.' });
        }
        res.status(200).json({ message: 'Student updated successfully.', student: result.rows[0] });
    }
    catch (err) {
        console.error('Error updating student:', err);
        res.status(500).json({ message: 'Internal server error.' });
    }
};
exports.updateStudent = updateStudent;
const getAllAnnouncements = async (req, res) => {
    const { instituteId } = req.query;
    if (!instituteId) {
        return res.status(400).json({ message: 'instituteId is required' });
    }
    try {
        const result = await index_1.db.query('SELECT * FROM announcements WHERE institute_id = $1 ORDER BY created_at DESC', [instituteId]);
        res.json(result.rows);
    }
    catch (error) {
        console.error('Error fetching announcements:', error);
        res.status(500).json({ message: 'Failed to load announcements' });
    }
};
exports.getAllAnnouncements = getAllAnnouncements;
const createAnnouncement = async (req, res) => {
    const { title, message, visible_to = 'all', instituteId } = req.body;
    if (!title || !message || !instituteId) {
        return res.status(400).json({ message: 'Title, message, and instituteId are required' });
    }
    try {
        const result = await index_1.db.query(`INSERT INTO announcements (title, content, visible_to, institute_id)
       VALUES ($1, $2, $3, $4) RETURNING *`, [title, message, visible_to, instituteId]);
        res.status(201).json(result.rows[0]);
    }
    catch (error) {
        console.error('Error creating announcement:', error);
        res.status(500).json({ message: 'Failed to create announcement' });
    }
};
exports.createAnnouncement = createAnnouncement;
const getAllResults = async (req, res) => {
    try {
        const instituteId = parseInt(req.query.instituteId);
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const search = req.query.search?.toLowerCase() || '';
        const branch = req.query.branch || '';
        const examTitle = req.query.examTitle || '';
        const whereClauses = [`students.institute_id = $1`];
        const values = [instituteId];
        let paramIndex = 2;
        if (search) {
            whereClauses.push(`(
        LOWER(students.name) LIKE $${paramIndex} OR
        LOWER(exams.title) LIKE $${paramIndex} OR
        LOWER(branches.name) LIKE $${paramIndex}
      )`);
            values.push(`%${search}%`);
            paramIndex++;
        }
        if (branch) {
            whereClauses.push(`branches.name = $${paramIndex}`);
            values.push(branch);
            paramIndex++;
        }
        if (examTitle) {
            whereClauses.push(`exams.title = $${paramIndex}`);
            values.push(examTitle);
            paramIndex++;
        }
        const whereSQL = `WHERE ${whereClauses.join(' AND ')}`;
        const resultsQuery = `
      SELECT 
        exams.id AS examid,
        exams.title AS examtitle,
        students.name AS studentname,
        branches.name AS branch,
        results.score,
        results.status
      FROM student_exam_results results
      JOIN students ON results.student_id = students.id
      JOIN exams ON results.exam_id = exams.id
      JOIN branches ON students.branch_id = branches.id
      ${whereSQL}
      ORDER BY exams.id DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
        values.push(limit, offset);
        const countQuery = `
      SELECT COUNT(*) AS total
      FROM student_exam_results results
      JOIN students ON results.student_id = students.id
      JOIN exams ON results.exam_id = exams.id
      JOIN branches ON students.branch_id = branches.id
      ${whereSQL}
    `;
        const [resultsData, countData] = await Promise.all([
            index_1.db.query(resultsQuery, values),
            index_1.db.query(countQuery, values.slice(0, paramIndex - 1))
        ]);
        res.json({
            results: resultsData.rows,
            totalCount: parseInt(countData.rows[0].total)
        });
    }
    catch (err) {
        console.error('Error fetching results:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getAllResults = getAllResults;
const getTopPerformers = async (req, res) => {
    try {
        const instituteId = parseInt(req.query.instituteId);
        const examTitle = req.query.examTitle;
        const branch = req.query.branch || '';
        const limit = parseInt(req.query.limit) || 5;
        if (!examTitle || !instituteId) {
            return res.status(400).json({ error: 'instituteId and examTitle are required' });
        }
        const values = [instituteId, examTitle, branch || null, limit];
        const result = await index_1.db.query(`
      SELECT 
        students.name AS studentname,
        branches.name AS branch,
        exams.title AS examtitle,
        results.score,
        results.status
      FROM student_exam_results results
      JOIN students ON results.student_id = students.id
      JOIN branches ON students.branch_id = branches.id
      JOIN exams ON results.exam_id = exams.id
      WHERE students.institute_id = $1 AND exams.title = $2
        AND ($3::text IS NULL OR branches.name = $3)
      ORDER BY results.score DESC
      LIMIT $4;
      `, values);
        res.json({ topPerformers: result.rows });
    }
    catch (error) {
        console.error('Error fetching top performers:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getTopPerformers = getTopPerformers;
const getStudentReport = async (req, res) => {
    try {
        const instituteId = parseInt(req.query.instituteId);
        const studentName = req.query.studentName;
        const branch = req.query.branch || '';
        if (!instituteId || !studentName) {
            return res.status(400).json({ error: 'instituteId and studentName are required' });
        }
        const values = [instituteId, studentName, branch || null];
        const result = await index_1.db.query(`
      SELECT 
        exams.title AS examtitle,
        results.score,
        results.status
      FROM student_exam_results results
      JOIN students ON results.student_id = students.id
      JOIN exams ON results.exam_id = exams.id
      JOIN branches ON students.branch_id = branches.id
      WHERE students.institute_id = $1
        AND LOWER(students.name) = LOWER($2)
        AND ($3::text IS NULL OR branches.name = $3)
      ORDER BY exams.id DESC
      `, values);
        res.json({ report: result.rows });
    }
    catch (error) {
        console.error('Error fetching student report:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getStudentReport = getStudentReport;
const getExamSummary = async (req, res) => {
    try {
        const instituteId = parseInt(req.query.instituteId);
        const examTitle = req.query.examTitle;
        const branch = req.query.branch === 'null' || req.query.branch === undefined ? null : req.query.branch;
        if (!instituteId || !examTitle) {
            return res.status(400).json({ error: 'instituteId and examTitle are required' });
        }
        // Step 1: Get examId
        const examResult = await index_1.db.query(`SELECT id FROM exams WHERE title = $1 LIMIT 1`, [examTitle]);
        if (examResult.rows.length === 0) {
            return res.status(404).json({ error: 'Exam not found' });
        }
        const examId = examResult.rows[0].id;
        // Step 2: Get all students enabled for this exam
        const enabledStudentsQuery = `
      SELECT s.id, s.name, b.name AS branch
      FROM exam_student_assignments e
      JOIN students s ON e.student_id = s.id
      JOIN branches b ON s.branch_id = b.id
      WHERE e.exam_id = $1 AND s.institute_id = $2
        AND ($3::text IS NULL OR b.name = $3)
    `;
        const enabledStudents = await index_1.db.query(enabledStudentsQuery, [examId, instituteId, branch]);
        // Step 3: Get all submitted results
        const attendedQuery = `
      SELECT s.id, s.name, b.name AS branch, r.score, r.status
      FROM student_exam_results r
      JOIN students s ON r.student_id = s.id
      JOIN branches b ON s.branch_id = b.id
      WHERE r.exam_id = $1 AND s.institute_id = $2
        AND ($3::text IS NULL OR b.name = $3)
    `;
        const attendedResults = await index_1.db.query(attendedQuery, [examId, instituteId, branch]);
        const attendedIds = new Set(attendedResults.rows.map((r) => r.id));
        const notAttendedList = enabledStudents.rows.filter((s) => !attendedIds.has(s.id));
        // Stats
        const totalEnabled = enabledStudents.rows.length;
        const attendedCount = attendedResults.rows.length;
        const notAttendedCount = notAttendedList.length;
        const passCount = attendedResults.rows.filter((r) => r.status.toLowerCase() === 'pass').length;
        const failCount = attendedCount - passCount;
        const averageScore = attendedCount > 0
            ? (attendedResults.rows.reduce((sum, r) => sum + parseFloat(r.score), 0) / attendedCount).toFixed(2)
            : '0.00';
        res.json({
            examTitle,
            totalEnabled,
            attendedCount,
            notAttendedCount,
            passCount,
            failCount,
            averageScore,
            attendedList: attendedResults.rows,
            notAttendedList: notAttendedList
        });
    }
    catch (error) {
        console.error('Error in exam summary:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getExamSummary = getExamSummary;
const searchExams = async (req, res) => {
    const client = await index_1.db.connect();
    try {
        const { search = '', branch = '', date = '', sortField = 'created_at', sortOrder = 'asc', instituteId } = req.query;
        if (!instituteId) {
            return res.status(400).json({ message: 'instituteId is required' });
        }
        const validSortFields = ['title', 'created_at'];
        const validSortOrder = ['asc', 'desc'];
        const finalSortField = validSortFields.includes(sortField)
            ? sortField
            : 'created_at';
        const finalSortOrder = validSortOrder.includes(sortOrder.toLowerCase())
            ? sortOrder
            : 'asc';
        let query = `
      SELECT DISTINCT e.id, e.title, e.created_at, e.duration_min, e.pass_percentage, e.is_enabled, e.expires_at, e.result_locked
      FROM exams e
      LEFT JOIN exam_branch_assignments eb ON eb.exam_id = e.id AND eb.is_enabled = true
      LEFT JOIN branches b ON b.id = eb.branch_id
      WHERE e.created_by = $1
    `;
        const values = [instituteId];
        if (search && search !== '') {
            values.push(`%${search.toLowerCase()}%`);
            query += ` AND LOWER(e.title) LIKE $${values.length}`;
        }
        if (branch && branch !== '') {
            values.push(branch.toLowerCase());
            query += ` AND LOWER(b.name) = $${values.length}`;
        }
        if (typeof date === 'string' && date.trim() !== '') {
            values.push(date.trim());
            query += ` AND DATE(e.created_at) = $${values.length}`;
        }
        query += ` ORDER BY e.${finalSortField} ${finalSortOrder.toUpperCase()}`;
        const { rows } = await client.query(query, values);
        return res.json(rows);
    }
    catch (err) {
        console.error('Error searching exams:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
    finally {
        client.release();
    }
};
exports.searchExams = searchExams;
const getAssignedBranchesForExam = async (req, res) => {
    try {
        const examId = parseInt(req.query.examId);
        if (!examId) {
            return res.status(400).json({ error: 'examId is required' });
        }
        const result = await index_1.db.query(`SELECT branch_id FROM exam_branch_assignments WHERE exam_id = $1 AND is_enabled = true`, [examId]);
        const assignedBranchIds = result.rows.map((row) => row.branch_id);
        res.json({ assignedBranchIds });
    }
    catch (err) {
        console.error('Error fetching assigned branches:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getAssignedBranchesForExam = getAssignedBranchesForExam;
const getAssignedStudentsForExam = async (req, res) => {
    try {
        const examId = parseInt(req.query.examId);
        if (!examId) {
            return res.status(400).json({ error: 'examId is required' });
        }
        const result = await index_1.db.query(`SELECT branch_id FROM exam_student_assignments WHERE exam_id = $1 AND is_enabled = true`, [examId]);
        const assignedBranchIds = result.rows.map((row) => row.branch_id);
        res.json({ assignedBranchIds });
    }
    catch (err) {
        console.error('Error fetching assigned branches:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getAssignedStudentsForExam = getAssignedStudentsForExam;
const searchStudents = async (req, res) => {
    try {
        const { instituteId, query } = req.query;
        if (!instituteId || typeof instituteId !== 'string') {
            return res.status(400).json({ error: 'instituteId is required' });
        }
        const searchTerm = (query || '').toLowerCase();
        const result = await index_1.db.query(`
      SELECT s.id, s.name, s.email, b.name AS branch
      FROM students s
      JOIN branches b ON s.branch_id = b.id
      WHERE s.institute_id = $1
        AND (
          LOWER(s.name) LIKE $2 OR
          LOWER(s.email) LIKE $2
        )
        AND s.is_enabled = true
      ORDER BY s.name ASC
      `, [parseInt(instituteId), `%${searchTerm}%`]);
        res.json(result.rows);
    }
    catch (err) {
        console.error('Error searching students:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.searchStudents = searchStudents;
const toggleResultLock = async (req, res) => {
    const { examId } = req.params;
    const { result_locked } = req.body;
    if (!examId || typeof result_locked !== 'boolean') {
        return res.status(400).json({ message: 'examId and valid result_locked value are required' });
    }
    try {
        const result = await index_1.db.query(`UPDATE exams SET result_locked = $1 WHERE id = $2 RETURNING id, result_locked`, [result_locked, examId]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Exam not found' });
        }
        return res.json({
            message: `✅ Result ${result_locked ? 'locked' : 'unlocked'} successfully.`,
            exam: result.rows[0]
        });
    }
    catch (err) {
        console.error('Error toggling result lock:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};
exports.toggleResultLock = toggleResultLock;
