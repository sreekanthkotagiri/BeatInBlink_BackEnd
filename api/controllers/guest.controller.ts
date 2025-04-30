// 1. Register Guest User
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../index';

export const registerGuestUser = async (req: Request, res: Response) => {
  const { guestName } = req.body;

  if (!guestName) {
    return res.status(400).json({ message: 'Guest name is required' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Generate a unique guest code using UUID
    const guestCode = uuidv4();

    // Insert guest into guest_users table
    const { rows } = await client.query(
      `INSERT INTO guest_users (username)
       VALUES ($1)
       RETURNING id, username`,
      [guestName]
    );

    const newGuest = rows[0];

    await client.query('COMMIT');

    res.status(201).json({
      guestCode: newGuest.id,
      guestName: newGuest.username,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error registering guest user:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
};


export const createGuestExam = async (req: Request, res: Response) => {
  const { guestId, title, description, scheduled_date, duration_min, pass_percentage, created_by, questions } = req.body;

  if (!title || !scheduled_date || !duration_min || !pass_percentage || !created_by || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ message: 'Missing required fields or no questions provided.' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // 1. Insert exam into guest_exams table and capture inserted id
    const examInsertResult = await client.query(
      `INSERT INTO guest_exams (guest_user_id, title, description, scheduled_date, duration_min, pass_percentage)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [guestId, title, description, scheduled_date, duration_min, pass_percentage]
    );

    const examId = examInsertResult.rows[0].id; // 👈 capture inserted exam id here
    // ✅ Generate exam link immediately
    const examLink = `${process.env.FRONTEND_URL}/guest-exam/${examId}`;

    // Update the exam with generated link
    await client.query(
      `UPDATE guest_exams SET exam_link = $1 WHERE id = $2`,
      [examLink, examId]
    );


    // 2. Insert each question into guest_questions table
    for (const q of questions) {
      const questionId = uuidv4();
      await client.query(
        `INSERT INTO guest_questions (id, guest_exam_id, type, question_text, options, correct_answer, marks, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          questionId,
          examId,                // 👈 now use correct examId
          q.type,
          q.question,
          q.choices ? JSON.stringify(q.choices) : null,
          q.correctAnswer,
          q.marks
        ]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({ message: 'Guest Exam created successfully', examId });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating guest exam:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
};

export const getGuestExamsByGuestCode = async (req: Request, res: Response) => {
  const { guestId } = req.query; // 👈 read from query parameter

  if (!guestId) {
    return res.status(400).json({ message: 'Guest code is required' });
  }

  const client = await db.connect();

  try {
    const { rows } = await client.query(
      `SELECT 
        id,
        title,
        description,
        scheduled_date,
        duration_min,
        pass_percentage,
        exam_link,
        created_at
       FROM guest_exams
       WHERE guest_user_id = $1
       ORDER BY created_at DESC`,
      [guestId]
    );

    res.status(200).json({
      exams: rows
    });

  } catch (error) {
    console.error('Error fetching guest exams:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
};

export const getGuestExamById = async (req: Request, res: Response) => {
  const { examId } = req.params;

  if (!examId) {
    return res.status(400).json({ message: 'Exam ID is required' });
  }

  const client = await db.connect();
  
  try {
    // 1. Fetch exam basic info
    const examResult = await client.query(
      `SELECT id, title, description, scheduled_date, duration_min, pass_percentage
       FROM guest_exams
       WHERE id = $1`,
      [examId]
    );

    if (examResult.rows.length === 0) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    const exam = examResult.rows[0];

    // 2. Fetch exam questions
    const questionsResult = await client.query(
      `SELECT id, type, question_text AS text, options
       FROM guest_questions
       WHERE guest_exam_id = $1`,
      [examId]
    );
    const questions = questionsResult.rows.map((q: any) => ({
      id: q.id,
      type: q.type,
      text: q.text,
      options: q.options,
    }));

    res.status(200).json({
      exam: {
        ...exam,
        questions
      }
    });

  } catch (error) {
    console.error('Error fetching exam:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
};

export const submitGuestExam = async (req: Request, res: Response) => {
  const { examId, studentName, answers } = req.body;

  if (!examId || !answers || typeof answers !== 'object') {
    return res.status(400).json({ message: 'Missing examId or answers' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Fetch all correct questions and correctAnswers from DB
    const questionsResult = await client.query(
      `SELECT id, correct_answer, marks FROM guest_questions WHERE guest_exam_id = $1`,
      [examId]
    );

    if (questionsResult.rows.length === 0) {
      return res.status(404).json({ message: 'No questions found for exam' });
    }

    const correctAnswersMap: { [key: string]: { correctAnswer: string; marks: number } } = {};

    questionsResult.rows.forEach((q) => {
      correctAnswersMap[q.id] = {
        correctAnswer: q.correct_answer,
        marks: q.marks || 1,
      };
    });

    let totalScore = 0;
    let totalMarks = 0;

    // Calculate student score
    for (const questionId in correctAnswersMap) {
      const correctAns = correctAnswersMap[questionId].correctAnswer;
      const marks = correctAnswersMap[questionId].marks;
      totalMarks += marks;

      const submittedAnswer = answers[questionId];

      if (!submittedAnswer) {
        continue; // no answer submitted for this question
      }

      // Compare after trimming and ignoring case
      if (submittedAnswer.trim().toLowerCase() === correctAns.trim().toLowerCase()) {
        totalScore += marks;
      }
    }

    // Calculate percentage
    const scorePercentage = (totalScore / totalMarks) * 100;

    // Save student's submission
    const submissionId = uuidv4();

    await client.query(
      `INSERT INTO guest_exam_attempts (id, guest_exam_id, student_name, score, submitted_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [submissionId, examId, studentName || 'Anonymous', Math.round(scorePercentage)]
    );

    await client.query('COMMIT');

    return res.status(200).json({

      totalScore,
      totalMarks,
      scorePercentage: Math.round(scorePercentage),
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error submitting exam:', error);
    return res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
};

export const getGuestExamResults = async (req: Request, res: Response) => {
  const { guestCode } = req.query;

  if (!guestCode) {
    return res.status(400).json({ message: 'Missing guestCode' });
  }

  const client = await db.connect();
  try {
    // Step 1: Find guest user by code
    const guestUserResult = await client.query(
      `SELECT id FROM guest_users WHERE id = $1`,
      [guestCode]
    );

    if (guestUserResult.rows.length === 0) {
      return res.status(404).json({ message: 'Guest user not found' });
    }

    const guestUserId = guestUserResult.rows[0].id;

    // Step 2: Find all exams created by this guest
    const examsResult = await client.query(
      `SELECT id FROM guest_exams WHERE guest_user_id = $1`,
      [guestUserId]
    );

    const examIds = examsResult.rows.map((exam: any) => exam.id);

    if (examIds.length === 0) {
      return res.status(200).json({ results: [] }); // No exams, no results
    }

    // Step 3: Fetch all student attempts for these exams
    const attemptsResult = await client.query(
      `
      SELECT a.id, e.title AS exam_title, a.student_name, a.score, a.submitted_at
      FROM guest_exam_attempts a
      INNER JOIN guest_exams e ON a.guest_exam_id = e.id
      WHERE a.guest_exam_id = ANY($1)
      ORDER BY a.submitted_at DESC
      `,
      [examIds]
    );

    const results = attemptsResult.rows;

    return res.status(200).json({ results });

  } catch (error) {
    console.error('Error fetching guest exam results:', error);
    return res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
};