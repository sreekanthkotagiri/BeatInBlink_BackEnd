"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStudentWithSearch = exports.getAllExams = exports.downloadSubmittedExam = exports.submitStudentExam = exports.studentResultById = void 0;
const index_1 = require("../index");
const docx_1 = require("docx");
const studentResultById = async (req, res) => {
    const { studentId } = req.query;
    if (!studentId) {
        return res.status(400).json({ message: 'student Id is required' });
    }
    try {
        if (studentId) {
            const result = await index_1.db.query(`WITH student_results AS (
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
`, [studentId]);
            return res.json(result.rows);
        }
    }
    catch (err) {
        console.error('Error fetching student(s):', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.studentResultById = studentResultById;
const submitStudentExam = async (req, res) => {
    const { studentId, examId, answers } = req.body;
    if (!studentId || !examId || !answers) {
        return res.status(400).json({ message: 'studentId, examId, and answers are required' });
    }
    try {
        // Step 1: Get all questions for the exam
        const questionRes = await index_1.db.query(`SELECT id, correct_answer, marks FROM questions WHERE exam_paper_id = $1`, [examId]);
        const questions = questionRes.rows;
        let score = 0;
        // Step 2: Evaluate answers
        for (const q of questions) {
            const givenAnswer = answers[q.id];
            if (givenAnswer &&
                givenAnswer.trim().toLowerCase() === q.correct_answer.trim().toLowerCase()) {
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
        const examMeta = await index_1.db.query(`SELECT pass_percentage, result_locked FROM exams WHERE id = $1`, [examId]);
        const passPercentage = examMeta.rows[0]?.pass_percentage ?? 35;
        const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);
        const percentage = totalMarks > 0 ? (score / totalMarks) * 100 : 0;
        const status = percentage >= passPercentage ? 'Pass' : 'Fail';
        // Step 4: Save to student_exam_results
        await index_1.db.query(`INSERT INTO student_exam_results (student_id, exam_id, score, status)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (student_id, exam_id)
       DO UPDATE SET score = EXCLUDED.score, status = EXCLUDED.status, submitted_at = now()`, [studentId, examId, score.toFixed(2), status]);
        // Step 5: Update exam_student_assignments
        await index_1.db.query(`UPDATE exam_student_assignments
       SET has_submitted = true
       WHERE student_id = $1 AND exam_id = $2`, [studentId, examId]);
        if (examMeta.rows[0]?.result_locked)
            return res.json({ result_locked: examMeta.rows[0]?.result_locked });
        else
            return res.json({ result_locked: examMeta.rows[0]?.result_locked, score: `${score.toFixed(2)}/${totalMarks}`, status });
    }
    catch (err) {
        console.error('Error submitting exam:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};
exports.submitStudentExam = submitStudentExam;
const downloadSubmittedExam = async (req, res) => {
    const { studentId, examId } = req.query;
    if (!studentId || !examId) {
        return res.status(400).json({ message: 'studentId and examId are required' });
    }
    try {
        // Fetch exam and result details
        const resultQuery = `
      SELECT r.score, r.status, r.submitted_at, e.title AS exam_title
      FROM student_exam_results r
      JOIN exams e ON r.exam_id = e.id
      WHERE r.student_id = $1 AND r.exam_id = $2
    `;
        const { rows: resultRows } = await index_1.db.query(resultQuery, [studentId, examId]);
        if (resultRows.length === 0) {
            return res.status(404).json({ message: 'Result not found for this student and exam' });
        }
        const data = resultRows[0];
        // Fetch questions
        const questionQuery = `SELECT * FROM questions WHERE exam_paper_id = $1`;
        const { rows: questionRows } = await index_1.db.query(questionQuery, [examId]);
        const questions = questionRows.map((q) => {
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
        // Construct docx document
        const doc = new docx_1.Document({
            sections: [
                {
                    headers: {
                        default: new docx_1.Header({
                            children: [
                                new docx_1.Paragraph({
                                    alignment: docx_1.AlignmentType.CENTER,
                                    children: [
                                        new docx_1.TextRun({ text: 'BeatInBlink Exam Paper', bold: true, size: 24 }),
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
                        new docx_1.Paragraph({
                            border: {
                                bottom: { color: 'auto', space: 1, style: docx_1.BorderStyle.SINGLE, size: 6 },
                            },
                            children: [
                                new docx_1.TextRun({ text: data.exam_title || 'Exam Title', bold: true, size: 36 }),
                            ],
                            alignment: docx_1.AlignmentType.CENTER,
                            spacing: { after: 400 },
                        }),
                        new docx_1.Paragraph({
                            children: [
                                new docx_1.TextRun({ text: '📝 Exam Paper', bold: true, size: 28 }),
                            ],
                            spacing: { after: 300 },
                        }),
                        ...questions.flatMap((q, idx) => {
                            const questionParagraphs = [
                                new docx_1.Paragraph({
                                    spacing: { after: 200 },
                                    children: [
                                        new docx_1.TextRun({
                                            text: `${idx + 1}. ${q.text} (${q.marks} mark${q.marks > 1 ? 's' : ''})`,
                                            bold: true,
                                            size: 26,
                                        }),
                                    ],
                                }),
                            ];
                            if (Array.isArray(q.options)) {
                                q.options.forEach((opt, i) => {
                                    questionParagraphs.push(new docx_1.Paragraph({
                                        spacing: { after: 100 },
                                        children: [
                                            new docx_1.TextRun({ text: `   ${String.fromCharCode(65 + i)}. ${opt}`, size: 24 }),
                                        ],
                                    }));
                                });
                            }
                            questionParagraphs.push(new docx_1.Paragraph({
                                spacing: { after: 300 },
                                children: [
                                    new docx_1.TextRun({ text: '   ✅ Correct Answer: ', bold: true, size: 24 }),
                                    new docx_1.TextRun({ text: q.correctAnswer, size: 24 }),
                                ],
                            }));
                            return questionParagraphs;
                        }),
                    ],
                },
            ],
        });
        const buffer = await docx_1.Packer.toBuffer(doc);
        res.setHeader('Content-Disposition', 'attachment; filename=exam_result.docx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.send(buffer);
    }
    catch (err) {
        console.error('Download error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.downloadSubmittedExam = downloadSubmittedExam;
const getAllExams = async (req, res) => {
    const { studentId, scheduled } = req.query;
    if (!studentId) {
        return res.status(400).json({ message: 'Institute Id is required' });
    }
    try {
        if (scheduled) {
            const result = await index_1.db.query('SELECT id, title, scheduled_date, duration_min FROM exams WHERE created_by = $1 and scheduled_date > current_date', [studentId]);
            return res.json(result.rows);
        }
        else {
            const result = await index_1.db.query('SELECT id, title, scheduled_date, duration_min FROM exams WHERE created_by = $1', [studentId]);
            return res.json(result.rows);
        }
    }
    catch (err) {
        console.error('Error fetching exam(s):', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.getAllExams = getAllExams;
const getStudentWithSearch = async (req, res) => {
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
        const values = [instituteId];
        let paramIndex = 2;
        if (query) {
            baseQuery += ` AND (LOWER(s.name) LIKE $${paramIndex} OR LOWER(s.email) LIKE $${paramIndex})`;
            values.push(`%${query.toLowerCase()}%`);
            paramIndex++;
        }
        if (branch) {
            baseQuery += ` AND LOWER(b.name) = $${paramIndex}`;
            values.push(branch.toLowerCase());
        }
        const result = await index_1.db.query(baseQuery, values);
        return res.json(result.rows);
    }
    catch (err) {
        console.error('Error fetching students:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};
exports.getStudentWithSearch = getStudentWithSearch;
