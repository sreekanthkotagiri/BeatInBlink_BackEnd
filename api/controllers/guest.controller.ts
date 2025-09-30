// 1. Register Guest User
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../index';
import { Document, Packer, Paragraph, TextRun, Header, AlignmentType, BorderStyle } from 'docx';

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
  const {
    guestId,
    title,
    description,
    scheduled_date,
    duration_min,
    pass_percentage,
    created_by,
    questions,
    enableTimeLimit = false,
    restrictAccess = false,
    downloadable,
  } = req.body;

  // Basic validation
  if (!guestId || !title || !scheduled_date || pass_percentage == null || !created_by || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ message: 'Missing required fields or no questions provided.' });
  }

  if (enableTimeLimit && (!duration_min || duration_min <= 0)) {
    return res.status(400).json({ message: 'Duration is required when time limit is enabled.' });
  }

  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // 1. Insert exam
    const insertExamQuery = `
      INSERT INTO guest_exams (
        guest_user_id,
        title,
        description,
        scheduled_date,
        duration_min,
        pass_percentage,
        enable_time_limit,
        restrict_access,
        downloadable
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id;
    `;

    const examInsertResult = await client.query(insertExamQuery, [
      guestId,
      title,
      description,
      scheduled_date,
      enableTimeLimit ? duration_min : null, // allow null if not enabled
      pass_percentage,
      enableTimeLimit,
      restrictAccess,
      downloadable
    ]);

    const examId = examInsertResult.rows[0].id;
    const examLink = `${process.env.FRONTEND_URL}/guest-exam/${examId}`;

    // 2. Update exam with link
    await client.query(
      `UPDATE guest_exams SET exam_link = $1 WHERE id = $2`,
      [examLink, examId]
    );

    // 3. Insert questions
    for (const q of questions) {
      const questionId = uuidv4();
      await client.query(
        `INSERT INTO guest_questions (
          id,
          guest_exam_id,
          type,
          question_text,
          options,
          correct_answer,
          marks,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          questionId,
          examId,
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
    // 1. Fetch exam details including new fields
    const examResult = await client.query(
      `SELECT
        id,
        title,
        description,
        scheduled_date,
        duration_min,
        pass_percentage,
        enable_time_limit,
        restrict_access
       FROM guest_exams
       WHERE id = $1`,
      [examId]
    );

    if (examResult.rows.length === 0) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    const exam = examResult.rows[0];

    // 2. Fetch questions
    const questionsResult = await client.query(
      `SELECT id, type, question_text AS text, options, marks
       FROM guest_questions
       WHERE guest_exam_id = $1`,
      [examId]
    );

    const questions = questionsResult.rows.map((q: any) => ({
      id: q.id,
      type: q.type,
      text: q.text,
      options: q.options,
      marks: q.marks,
    }));

    res.status(200).json({
      exam: {
        ...exam,
        questions,
      },
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

    // Fetch questions AND downloadable flag in one go using JOIN or separate queries
    const questionsResult = await client.query(
      `SELECT id, correct_answer, marks FROM guest_questions WHERE guest_exam_id = $1`,
      [examId]
    );

    if (questionsResult.rows.length === 0) {
      return res.status(404).json({ message: 'No questions found for exam' });
    }

    // Fetch downloadable value from guest_exams
    const examMetaResult = await client.query(
      `SELECT downloadable FROM guest_exams WHERE id = $1`,
      [examId]
    );

    if (examMetaResult.rows.length === 0) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    const { downloadable } = examMetaResult.rows[0];

    const correctAnswersMap: {
      [questionId: string]: { correctAnswer: string; marks: number };
    } = {};
    const evaluatedAnswers: {
      [questionId: string]: { correctAnswer: string; studentAnswer: string; marks: number };
    } = {};

    let totalScore = 0;
    let totalMarks = 0;

    questionsResult.rows.forEach((q) => {
      const questionId = q.id;
      const correctAnswer = (q.correct_answer || '').trim();
      const marks = q.marks || 1;

      correctAnswersMap[questionId] = { correctAnswer, marks };
      totalMarks += marks;

      const submittedAnswer = (answers[questionId] || '').trim();

      evaluatedAnswers[questionId] = {
        correctAnswer,
        studentAnswer: submittedAnswer,
        marks
      };

      if (submittedAnswer.toLowerCase() === correctAnswer.toLowerCase()) {
        totalScore += marks;
      }
    });

    const scorePercentage = (totalScore / totalMarks) * 100;
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
      evaluatedAnswers,
      downloadable, // ✅ Include in response
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

    // Step 3: Fetch all student attempts with total marks
    const attemptsResult = await client.query(
      `
      SELECT 
        a.id, 
        e.title AS exam_title, 
        a.student_name, 
        a.score, 
        a.submitted_at,
        COALESCE(SUM(q.marks), 0) AS total_marks
      FROM guest_exam_attempts a
      INNER JOIN guest_exams e ON a.guest_exam_id = e.id
      LEFT JOIN guest_questions q ON q.guest_exam_id = e.id
      WHERE a.guest_exam_id = ANY($1)
      GROUP BY a.id, e.title, a.student_name, a.score, a.submitted_at
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


export const downloadExam = async (req: Request, res: Response) => {
  const { examId } = req.query;

  if (!examId) {
    return res.status(400).json({ message: 'examId is required' });
  }

  try {
    // Fetch exam metadata
    const resultQuery = `
      SELECT e.title AS exam_title
      FROM guest_exams e
      WHERE e.id = $1
    `;
    const { rows: resultRows } = await db.query(resultQuery, [examId]);

    if (resultRows.length === 0) {
      return res.status(404).json({ message: 'Exam not found' });
    }
    const data = resultRows[0];

    // Fetch questions
    const questionQuery = `SELECT * FROM guest_questions WHERE guest_exam_id = $1`;
    const { rows: questionRows } = await db.query(questionQuery, [examId]);
    const questions = questionRows.map((q: any) => {
      const parsedOptions = typeof q.options === 'string' ? JSON.parse(q.options) : q.options;
      return {
        id: q.id,
        text: q.question_text || '',
        type: q.type,
        options: Array.isArray(parsedOptions) ? parsedOptions : parsedOptions?.choices || [],
        correctAnswer: q.correct_answer || '',
        marks: q.marks != null ? q.marks : '-',
      };
    });

    // Construct docx document
    const doc = new Document({
      sections: [
        {
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({ text: 'BeatInBlink Exam Paper', bold: true, size: 24 }),
                  ],
                })
              ]
            })
          },
          properties: {
            page: {
              margin: { top: 720, right: 720, bottom: 720, left: 720 }, // 1 inch margins
            },
          },
          children: [
            new Paragraph({
              border: {
                bottom: { color: 'auto', space: 1, style: BorderStyle.SINGLE, size: 6 },
              },
              children: [
                new TextRun({ text: data.exam_title || 'Exam Title', bold: true, size: 36 }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 },
            }),
            new Paragraph({
              children: [
                new TextRun({ text: '📝 Exam Paper', bold: true, size: 28 }),
              ],
              spacing: { after: 300 },
            }),
            ...questions.flatMap((q: any, idx: number) => {
              const questionParagraphs = [
                new Paragraph({
                  spacing: { after: 200 },
                  children: [
                    new TextRun({
                      text: `${idx + 1}. ${q.text} (${q.marks} mark${q.marks > 1 ? 's' : ''})`,
                      bold: true,
                      size: 26,
                    }),
                  ],
                }),
              ];

              if (Array.isArray(q.options)) {
                q.options.forEach((opt: string, i: number) => {
                  questionParagraphs.push(
                    new Paragraph({
                      spacing: { after: 100 },
                      children: [
                        new TextRun({ text: `   ${String.fromCharCode(65 + i)}. ${opt}`, size: 24 }),
                      ],
                    })
                  );
                });
              }

              questionParagraphs.push(
                new Paragraph({
                  spacing: { after: 300 },
                  children: [
                    new TextRun({ text: '   ✅ Correct Answer: ', bold: true, size: 24 }),
                    new TextRun({ text: q.correctAnswer, size: 24 }),
                  ],
                })
              );

              return questionParagraphs;
            }),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    res.setHeader('Content-Disposition', 'attachment; filename=exam_result.docx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(buffer);
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};