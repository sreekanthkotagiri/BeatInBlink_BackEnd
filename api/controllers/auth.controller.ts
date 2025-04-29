import { Request, Response } from 'express';
import { db } from '../index';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import PDFDocument from 'pdfkit';

const generateAccessToken = (user: any, userType: 'student' | 'institute') => {
  return jwt.sign(
    { id: user.id, email: user.email, userType },
    process.env.JWT_SECRET!,
    { expiresIn: '1h' }
  );
};

const generateRefreshToken = async (user: any, userType: 'student' | 'institute') => {
  const refreshToken = jwt.sign(
    { id: user.id, email: user.email, userType },
    process.env.REFRESH_SECRET!,
    { expiresIn: '7d' }
  );

  await db.query(
    `INSERT INTO refresh_tokens (user_id, user_type, token)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, user_type) DO UPDATE SET token = EXCLUDED.token`,
    [user.id, userType, refreshToken]
  );

  return refreshToken;
};

// Login handler for both students and institutes
export const loginUser = async (req: Request, res: Response) => {
  const { email, password, role } = req.body;

  if (!email || !password || !role) {
    return res.status(400).json({ message: 'Email, password, and userType are required' });
  }

  try {
    let userQuery;
    let user;

    if (role === 'institute') {
      // Institute login
      const result = await db.query(`SELECT * FROM institutes WHERE email = $1`, [email]);
      if (result.rows.length === 0) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      user = result.rows[0];
    } else {
      // Student login
      const result = await db.query(`SELECT 
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

    const isMatch = await bcrypt.compare(password, user.password_hash);
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
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Register student only (institutes are pre-created manually or via a separate route)
export const instituteReg = async (req: Request, res: Response) => {
  const { name, email, password, address } = req.body;

  if (!name || !email || !password || !address) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    const existingUser = await db.query('SELECT * FROM institutes WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.query(
      `INSERT INTO institutes (name, email, password_hash, address)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email`,
      [name, email, hashedPassword, address]
    );

    const newInstitute = result.rows[0];
    const token = generateAccessToken(newInstitute, 'institute');
    const refreshToken = await generateRefreshToken(newInstitute, 'institute');

    res.status(201).json({ token, refreshToken, institute: { ...newInstitute, userType: 'institute' } });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const studentReg = async (req: Request, res: Response) => {
  const { name, email, password, instituteId, branchId } = req.body;

  if (!name || !email || !password || !instituteId) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    const existingStudent = await db.query('SELECT * FROM students WHERE email = $1', [email]);
    if (existingStudent.rows.length > 0) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.query(
      `INSERT INTO students (name, email, password_hash, institute_id, branch_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email`,
      [name, email, hashedPassword, instituteId, branchId]
    );

    const newStudent = result.rows[0];
    const token = generateAccessToken(newStudent, 'student');
    const refreshToken = await generateRefreshToken(newStudent, 'student');

    res.status(201).json({ token, refreshToken, student: { ...newStudent, userType: 'student' } });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const bulkRegisterStudents = async (req: Request, res: Response) => {
  const students = req.body.students; // expecting array of students
  const { instituteId } = req.body;

  if (!Array.isArray(students) || students.length === 0 || !instituteId) {
    return res.status(400).json({ message: 'Students array and instituteId are required' });
  }

  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // Pre-check for duplicates
    for (const student of students) {
      const { email } = student;
      const exists = await client.query('SELECT id FROM students WHERE email = $1', [email]);
      if (exists.rows.length > 0) {
        throw new Error(`Duplicate email found: ${email}`);
      }
    }

    // Proceed with inserting all
    for (const student of students) {
      const { name, email, password, branch } = student;

      if (!name || !email || !password) {
        throw new Error(`Missing required fields for ${email}`);
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      await client.query(
        `INSERT INTO students (name, email, password_hash, institute_id, branch)
         VALUES ($1, $2, $3, $4, $5)`,
        [name, email, hashedPassword, instituteId, branch || 'General']
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'All students registered successfully.' });

  } catch (error) {
    await client.query('ROLLBACK');
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Bulk registration failed:', errorMessage);
    res.status(500).json({ message: 'Bulk registration failed.', reason: errorMessage });
  } finally {
    client.release();
  }
};

export const getStudentById = async (req: Request, res: Response) => {
  const { studentId } = req.query;

  if (!studentId) {
    return res.status(400).json({ message: 'student Id is required' });
  }

  try {
    if (studentId) {
      const result = await db.query(
        `WITH student_info AS (
  SELECT 
    s.id AS student_id,
    s.name AS student_name,
    i.name AS institute_name,
    s.institute_id,
    s.branch_id
  FROM students s
  JOIN institutes i ON s.institute_id = i.id
  WHERE s.id = $1
),
student_enrollments AS (
  SELECT 
    se.exam_id,
    se.student_id,
    se.has_submitted
  FROM student_exam_enrollments se
  WHERE se.student_id = $1
),
enabled_exam_details AS (
  SELECT 
    e.id AS exam_id,
    e.title,
    e.description,
    e.scheduled_date,
    e.duration_min,
    e.pass_percentage,
    se.has_submitted
  FROM exams e
  JOIN exam_branch_assignments eb ON eb.exam_id = e.id
  JOIN student_info si ON si.branch_id = eb.branch_id
  JOIN student_enrollments se ON se.exam_id = e.id
  WHERE se.student_id = si.student_id 
)
SELECT 
  json_agg(ee.*) FILTER (WHERE ee.has_submitted = false) AS enabledExams,
  json_build_object(
    'studentId', si.student_id,
    'studentName', si.student_name,
    'instituteName', si.institute_name,
    'totalExams', COUNT(ee.*),
    'submitted', COUNT(*) FILTER (WHERE ee.has_submitted = true),
    'pending', COUNT(*) FILTER (WHERE ee.has_submitted = false)
  ) AS studentDetails
FROM student_info si
LEFT JOIN enabled_exam_details ee ON true
GROUP BY si.student_id, si.student_name, si.institute_name;
`,
        [studentId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Student not found' });
      }
      return res.json(result.rows);
    }
  } catch (err) {
    console.error('Error fetching student(s):', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getExams = async (req: Request, res: Response) => {
  const { instituteId, scheduled } = req.query;
  if (!instituteId) {
    return res.status(400).json({ message: 'Institute Id is required' });
  }

  try {
    const baseQuery = `
      SELECT 
        e.id, 
        e.title, 
        e.scheduled_date, 
        e.duration_min,
        EXISTS (
          SELECT 1 FROM exam_branch_assignments b WHERE b.exam_id = e.id
        ) AS enabled
      FROM exams e
      WHERE e.created_by = $1
    `;

    const filterQuery = scheduled
      ? `${baseQuery} AND e.scheduled_date > current_date`
      : baseQuery;

    const result = await db.query(filterQuery, [instituteId]);
    return res.json(result.rows);
  } catch (err) {
    console.error('Error fetching exam(s):', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getResults = async (req: Request, res: Response) => {
  const { instituteId } = req.query;
  if (!instituteId) {
    return res.status(400).json({ message: 'Institute Id is required' });
  }

  try {
    const result = await db.query(
      `SELECT r.exam_id AS examId, e.title AS examTitle,
          s.name AS studentName,
          s.branch AS branch,
          r.score AS score,
          r.status AS status
        FROM results r
        JOIN students s ON r.student_id = s.id
        JOIN exams e ON r.exam_id = e.id
                where s.institute_id = $1
        ORDER BY r.exam_id, s.name`,
      [instituteId]
    );

    return res.json(result.rows);
  } catch (err) {
    console.error('Error fetching exam(s):', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const createExam = async (req: Request, res: Response) => {
  const client = await db.connect();
  try {
    const {
      title,
      description,
      scheduled_date,
      duration_min,
      pass_percentage,
      created_by,
      questions,
    } = req.body;

    // ✅ Calculate total marks
    const totalMarks = questions.reduce((sum: number, q: any) => sum + Number(q.marks || 0), 0);

    await client.query('BEGIN');

    // ✅ Insert into exams
    const examInsertQuery = `
      INSERT INTO exams (title, description, scheduled_date, duration_min, pass_percentage, total_marks, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id`;

    const { rows: examRows } = await client.query(examInsertQuery, [
      title,
      description,
      scheduled_date,
      duration_min,
      pass_percentage,
      totalMarks,
      created_by,
    ]);

    const examId = examRows[0].id;

    // ✅ Insert each question
    for (const question of questions) {
      const { text, type, options, correctAnswer, marks } = question;
      await client.query(
        `INSERT INTO questions (exam_paper_id, question_text, options, correct_answer, marks)
         VALUES ($1, $2, $3, $4, $5)`,
        [examId, text, JSON.stringify({ type, choices: options }), correctAnswer, marks]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'Exam created successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating exam:', error);
    res.status(500).json({ error: 'Failed to create exam' });
  } finally {
    client.release();
  }
};


export const getExamById = async (req: Request, res: Response) => {
  const client = await db.connect();
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
      };
    });


    return res.status(200).json({
      id: exam.id,
      title: exam.title,
      description: exam.description,
      scheduled_date: exam.scheduled_date,
      duration_min: exam.duration_min,
      created_by: exam.created_by,
      questions
    });

  } catch (err) {
    console.error('Error getting exam:', err);
    return res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
};


export const getAllStudentExams = async (req: Request, res: Response) => {
  const { studentId, submitted } = req.query;

  if (!studentId) {
    return res.status(400).json({ message: 'studentId is required' });
  }

  try {
    const includeSubmittedFilter = submitted === 'true';

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
      student_enrollments AS (
        SELECT 
          se.exam_id, 
          se.student_id, 
          se.has_submitted, 
          se.is_enabled
        FROM student_exam_enrollments se
        WHERE se.student_id = $1
        ${includeSubmittedFilter ? 'AND se.has_submitted = true' : ''}
      ),
      exams_info AS (
        SELECT 
          e.id, 
          e.title, 
          e.scheduled_date, 
          e.duration_min, 
          e.total_marks,
          e.pass_percentage
        FROM exams e
      ),
      student_results AS (
        SELECT 
          r.exam_id, 
          r.student_id, 
          r.score, 
          r.status,
          r.created_at
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
            'isEnabled', se.is_enabled,
            'hasSubmitted', se.has_submitted,
            'score', r.score,
            'totalMarks', e.total_marks,
            'status', r.status,
            'submittedAt', r.created_at
          )
        ) AS exams,
        json_build_object(
          'studentId', si.student_id,
          'studentName', si.student_name,
          'instituteName', si.institute_name
        ) AS student
      FROM student_info si
      LEFT JOIN student_enrollments se ON si.student_id = se.student_id
      LEFT JOIN exams_info e ON e.id = se.exam_id
      LEFT JOIN student_results r ON r.exam_id = e.id AND r.student_id = si.student_id
      GROUP BY si.student_id, si.student_name, si.institute_name
    `;

    const result = await db.query(query, [studentId]);
    return res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching student exams:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};




export const ViewExamById = async (req: Request, res: Response) => {
  const client = await db.connect();
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

  } catch (err) {
    console.error('Error getting exam:', err);
    return res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
};

export const updateExamById = async (req: Request, res: Response) => {
  const client = await db.connect();

  const {
    id,
    title,
    description,
    scheduled_date,
    duration_min,
    pass_percentage,
    created_by,
    questions
  } = req.body;

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

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating exam:', err);
    return res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
};


export const getDashBoard = async (req: Request, res: Response) => {
  const { instituteId } = req.query;
  if (!instituteId) {
    return res.status(400).json({ message: 'Institute Id is required' });
  }

  try {
    const result = await db.query(
      `
        SELECT 
          (SELECT COUNT(*) FROM students WHERE institute_id = $1) AS totalStudents,
          (SELECT COUNT(*) FROM exams WHERE created_by = $1) AS totalExams
      `,
      [instituteId]
    );
    const { totalstudents, totalexams } = result.rows[0];
    const upcomingExamsRes = await db.query(
      `SELECT e.id, e.title, e.scheduled_date, e.duration_min
       FROM exams e
       WHERE e.created_by = $1 AND e.scheduled_date >= CURRENT_DATE
       order by e.scheduled_date`,
      [instituteId]
    );
    return res.json({
      studentsCount: parseInt(totalstudents, 10),
      examsCount: parseInt(totalexams, 10),
      upcomingExams: upcomingExamsRes.rows
    });
  } catch (err) {
    console.error('Error fetching exam(s):', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getBranches = async (req: Request, res: Response) => {
  const { instituteId } = req.query;

  if (!instituteId) {
    return res.status(400).json({ message: 'Institute Id is required' });
  }

  try {
    const result = await db.query(
      `SELECT id, name FROM branches WHERE institute_id = $1 ORDER BY name`,
      [instituteId]
    );

    return res.json(result.rows);
  } catch (err) {
    console.error('Error fetching branches:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const createBranch = async (req: Request, res: Response) => {
  const { branchName, instituteId } = req.body;

  if (!branchName || !instituteId) {
    return res.status(400).json({ message: 'Branch name and Institute ID are required.' });
  }

  try {
    // Optional: Check for duplicate branch in the same institute
    const duplicateCheck = await db.query(
      'SELECT * FROM branches WHERE name = $1 AND institute_id = $2',
      [branchName, instituteId]
    );

    if (duplicateCheck.rows.length > 0) {
      return res.status(409).json({ message: 'Branch already exists for this institute.' });
    }

    const result = await db.query(
      `INSERT INTO branches (name, institute_id)
       VALUES ($1, $2)
       RETURNING id, name`,
      [branchName, instituteId]
    );

    return res.status(201).json({ message: 'Branch created successfully', branch: result.rows[0] });
  } catch (err: any) {
    console.error('Error creating branch:', err);
    if (err.code === '23505' && err.constraint === 'unique_branch_name_per_institute') {
      return res.status(409).json({ message: 'Branch already exists (case-insensitive match).' });
    }
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const refreshAccessToken = async (req: Request, res: Response) => {
  const { refreshToken, userType } = req.body;

  if (!refreshToken || !userType) {
    return res.status(401).json({ message: 'Refresh token and userType required' });
  }

  try {
    const payload = jwt.verify(refreshToken, process.env.REFRESH_SECRET!) as any;

    const result = await db.query(
      'SELECT * FROM refresh_tokens WHERE user_id = $1 AND token = $2 AND user_type = $3',
      [payload.id, refreshToken, userType]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ message: 'Invalid refresh token' });
    }

    const newAccessToken = generateAccessToken(payload, userType);
    res.json({ token: newAccessToken });
  } catch (err) {
    console.error('Refresh token error:', err);
    res.status(403).json({ message: 'Invalid or expired refresh token' });
  }
};

export const logoutUser = async (req: Request, res: Response) => {
  const { refreshToken, userType } = req.body;

  if (!refreshToken || !userType) {
    return res.status(400).json({ message: 'Refresh token and userType are required' });
  }

  try {
    await db.query('DELETE FROM refresh_tokens WHERE token = $1 AND user_type = $2', [
      refreshToken,
      userType
    ]);

    res.status(200).json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const enableExamToBranches = async (req: Request, res: Response) => {
  const { examId, branchIds } = req.body;

  if (!examId || !Array.isArray(branchIds) || branchIds.length === 0) {
    return res.status(400).json({ message: 'examId and targetIds (branch IDs) are required' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Insert into exam_branch_assignments with ON CONFLICT DO NOTHING
    for (const branchId of branchIds) {
      await client.query(
        `INSERT INTO exam_branch_assignments (exam_id, branch_id)
         VALUES ($1, $2)
         ON CONFLICT (exam_id, branch_id) DO NOTHING`,
        [examId, branchId]
      );
    }

    // Get all students belonging to these branches
    const studentResult = await client.query(
      `SELECT id FROM students WHERE branch_id = ANY($1::int[])`,
      [branchIds]
    );
    const studentIds = studentResult.rows.map((row) => row.id);

    // Enable exam for those students
    for (const studentId of studentIds) {
      await client.query(
        `INSERT INTO student_exam_enrollments (student_id, exam_id, is_enabled)
         VALUES ($1, $2, true)
         ON CONFLICT (student_id, exam_id) DO UPDATE SET is_enabled = true`,
        [studentId, examId]
      );
    }

    await client.query('COMMIT');
    return res.status(200).json({ message: '✅ Exam assigned to branches and students enabled.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error assigning exam:', err);
    return res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
};


export const updateStudent = async (req: Request, res: Response) => {
  const { id, name, email, branch, is_enabled } = req.body;

  if (!id || !name || !email || !branch) {
    return res.status(400).json({ message: 'Missing required student fields.' });
  }

  try {
    // Get the branch_id using branch name (assuming uniqueness per institute)
    const branchRes = await db.query(
      'SELECT id FROM branches WHERE name = $1',
      [branch]
    );

    if (branchRes.rowCount === 0) {
      return res.status(404).json({ message: 'Branch not found.' });
    }

    const branchId = branchRes.rows[0].id;

    const result = await db.query(
      `UPDATE students 
       SET name = $1, email = $2, branch_id = $3, is_enabled = $4
       WHERE id = $5 
       RETURNING *`,
      [name, email, branchId, is_enabled, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    res.status(200).json({ message: 'Student updated successfully.', student: result.rows[0] });
  } catch (err) {
    console.error('Error updating student:', err);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

export const getAllAnnouncements = async (req: Request, res: Response) => {
  const { instituteId } = req.query;

  if (!instituteId) {
    return res.status(400).json({ message: 'instituteId is required' });
  }

  try {
    const result = await db.query(
      'SELECT * FROM announcements WHERE institute_id = $1 ORDER BY created_at DESC',
      [instituteId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching announcements:', error);
    res.status(500).json({ message: 'Failed to load announcements' });
  }
};

export const createAnnouncement = async (req: Request, res: Response) => {
  const { title, message, visible_to = 'all', instituteId } = req.body;

  if (!title || !message || !instituteId) {
    return res.status(400).json({ message: 'Title, message, and instituteId are required' });
  }

  try {
    const result = await db.query(
      `INSERT INTO announcements (title, content, visible_to, institute_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [title, message, visible_to, instituteId]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating announcement:', error);
    res.status(500).json({ message: 'Failed to create announcement' });
  }
};

export const downloadSubmittedExam = async (req: Request, res: Response) => {
  const { studentId, examId } = req.query;

  if (!studentId || !examId) {
    return res.status(400).json({ message: 'studentId and examId are required' });
  }

  try {
    // Fetch exam and result details
    const resultQuery = `
      SELECT r.score, r.status, r.created_at, e.title AS exam_title
      FROM results r
      JOIN exams e ON r.exam_id = e.id
      WHERE r.student_id = $1 AND r.exam_id = $2
    `;
    const { rows: resultRows } = await db.query(resultQuery, [studentId, examId]);

    if (resultRows.length === 0) {
      return res.status(404).json({ message: 'Result not found for this student and exam' });
    }
    const data = resultRows[0];

    // Fetch questions
    const questionQuery = `SELECT * FROM questions WHERE exam_paper_id = $1`;
    const { rows: questionRows } = await db.query(questionQuery, [examId]);

    const questions = questionRows.map((q: any) => {
      const parsedOptions = typeof q.options === 'string' ? JSON.parse(q.options) : q.options;
      return {
        id: q.id,
        text: q.question_text,
        type: parsedOptions.type,
        options: parsedOptions.choices as string[],
        correctAnswer: q.correct_answer,
        marks: q.marks,
      };
    });

    // PDF generation
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument();

    res.setHeader('Content-disposition', 'attachment; filename=exam_result.pdf');
    res.setHeader('Content-type', 'application/pdf');
    doc.pipe(res);

    // Header with Exam Title
    doc.fontSize(22).text(data.exam_title, { align: 'center', underline: true });
    doc.moveDown();

    // Question-wise Detail
    doc.fontSize(16).text('Question Details', { underline: true });
    questions.forEach((q: any, idx: number) => {
      doc.moveDown(0.5);
      doc.fontSize(12).text(`${idx + 1}. ${q.text}`);
      if (q.options && q.options.length > 0) {
        q.options.forEach((opt: string, i: number) => {
          doc.text(`   ${String.fromCharCode(65 + i)}. ${opt}`);
        });
      }
      doc.text(`   Correct Answer: ${q.correctAnswer}`);
      doc.text(`   Marks: ${q.marks}`);
    });

    doc.end();
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};