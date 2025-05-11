import { Request, Response } from 'express';
import { db } from '../index';

export const studentResultById = async (req: Request, res: Response) => {
  const { studentId } = req.query;

  if (!studentId) {
    return res.status(400).json({ message: 'student Id is required' });
  }

  try {
    if (studentId) {
      const result = await db.query(
        `WITH student_results AS (
  SELECT 
    e.id AS exam_id,
    e.title,
    e.description,
    e.scheduled_date,
    e.duration_min,
    e.pass_percentage,
    r.score,
    r.status,
    r.created_at AS submitted_at
  FROM results r
  JOIN exams e ON r.exam_id = e.id
  WHERE r.student_id = $1
)
SELECT 
  json_agg(sr) AS results,
  json_build_object(
    'totalExams', COUNT(*),
    'submitted', COUNT(*) FILTER (WHERE sr.status IS NOT NULL),
    'pending', COUNT(*) FILTER (WHERE sr.status IS NULL)
  ) AS stats
FROM student_results sr;
`,  [studentId]);
      return res.json(result.rows);
    }
  } catch (err) {
    console.error('Error fetching student(s):', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const submitStudentExam = async (req: Request, res: Response) => {
  const { studentId, examId, answers } = req.body;

  if (!studentId || !examId || !answers) {
    return res.status(400).json({ message: 'studentId, examId, and answers are required' });
  }

  try {
    // Step 1: Get all questions for the exam
    const questionRes = await db.query(
      `SELECT id, correct_answer, marks FROM questions WHERE exam_paper_id = $1`,
      [examId]
    );

    const questions = questionRes.rows;
    let score = 0;

    // Step 2: Evaluate answers
    for (const q of questions) {
      const givenAnswer = answers[q.id];
      if (
        givenAnswer &&
        givenAnswer.trim().toLowerCase() === q.correct_answer.trim().toLowerCase()
      ) {
        score += q.marks;
      }

      // Optional: For future question-level tracking
      /*
      await db.query(
        `INSERT INTO student_exam_attempts (student_id, exam_id, question_id, selected_answer, is_correct, awarded_marks)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (student_id, exam_id, question_id) DO UPDATE
         SET selected_answer = EXCLUDED.selected_answer,
             is_correct = EXCLUDED.is_correct,
             awarded_marks = EXCLUDED.awarded_marks`,
        [
          studentId,
          examId,
          q.id,
          givenAnswer,
          givenAnswer?.trim().toLowerCase() === q.correct_answer.trim().toLowerCase(),
          givenAnswer?.trim().toLowerCase() === q.correct_answer.trim().toLowerCase() ? q.marks : 0,
        ]
      );
      */
    }

    // Step 3: Fetch pass percentage
    const examMeta = await db.query(`SELECT pass_percentage FROM exams WHERE id = $1`, [examId]);
    const passPercentage = examMeta.rows[0]?.pass_percentage ?? 35;

    const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);
    const percentage = totalMarks > 0 ? (score / totalMarks) * 100 : 0;
    const status = percentage >= passPercentage ? 'Pass' : 'Fail';

    // Step 4: Save to student_exam_results
    await db.query(
      `INSERT INTO student_exam_results (student_id, exam_id, score, status)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (student_id, exam_id)
       DO UPDATE SET score = EXCLUDED.score, status = EXCLUDED.status, submitted_at = now()`,
      [studentId, examId, score.toFixed(2), status]
    );

    // Step 5: Update exam_student_assignments
    await db.query(
      `UPDATE exam_student_assignments
       SET has_submitted = true
       WHERE student_id = $1 AND exam_id = $2`,
      [studentId, examId]
    );

    return res.json({ score: `${score.toFixed(2)}/${totalMarks}`, status });
  } catch (err) {
    console.error('Error submitting exam:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};


export const getAllExams = async (req: Request, res: Response) => {
  const { studentId,scheduled } = req.query;
  if (!studentId) {
    return res.status(400).json({ message: 'Institute Id is required' });
  }

  try { 
    if(scheduled) {
    const result = await db.query(
      'SELECT id, title, scheduled_date, duration_min FROM exams WHERE created_by = $1 and scheduled_date > current_date',
      [studentId]
    );
    return res.json(result.rows);
  } else {
    const result = await db.query(
      'SELECT id, title, scheduled_date, duration_min FROM exams WHERE created_by = $1',
      [studentId]
    );
    return res.json(result.rows);
  }
  } catch (err) {
    console.error('Error fetching exam(s):', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getStudentWithSearch = async (req: Request, res: Response) => {
  const { instituteId, query, branch } = req.query;

  if (!instituteId) {
    return res.status(400).json({ message: 'Institute Id is required' });
  }

  try {
    let baseQuery = `
      SELECT s.id, s.name, s.email, s.is_enabled, s.branch_id, b.name AS branch
      FROM students s
      JOIN branches b ON s.branch_id = b.id
      WHERE s.institute_id = $1
    `;
    const values: any[] = [instituteId];
    let paramIndex = 2;

    if (query) {
      baseQuery += ` AND (LOWER(s.name) LIKE $${paramIndex} OR LOWER(s.email) LIKE $${paramIndex})`;
      values.push(`%${(query as string).toLowerCase()}%`);
      paramIndex++;
    }

    if (branch) {
      baseQuery += ` AND LOWER(b.name) = $${paramIndex}`;
      values.push((branch as string).toLowerCase());
    }

    const result = await db.query(baseQuery, values);
    return res.json(result.rows);
  } catch (err) {
    console.error('Error fetching students:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};