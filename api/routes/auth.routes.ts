import express from 'express';
import { instituteReg, loginUser, refreshAccessToken, logoutUser, studentReg, getExams, getDashBoard, getResults, createExam, getExamById, updateExamById, bulkRegisterStudents, getBranches, createBranch, updateStudent, ViewExamById, getAllAnnouncements, getAllStudentExams, downloadSubmittedExam, getAllResults, getTopPerformers, getStudentReport, getExamSummary, searchExams, getAssignedBranchesForExam, searchStudents, assignExamToBranches, assignExamToStudents, toggleExamStatus, getStudentResults, getStudentProfileById, getStudentExams, toggleResultLock  } from '../controllers/auth.controller'
import { authenticateToken } from '../middleware/auth.middleware';
import { getStudentWithSearch, studentResultById, submitStudentExam } from '../controllers/student.auth.controller';
import { createGuestExam, getGuestExamById, getGuestExamResults, getGuestExamsByGuestCode, registerGuestUser, submitGuestExam } from '../controllers/guest.controller';

const router = express.Router();
router.post('/login', loginUser);
router.post('/logout', authenticateToken, logoutUser);
router.post('/refresh-token', refreshAccessToken);

router.get('/institute', getDashBoard);
router.post('/inst-register', instituteReg);
router.get('/institute/branches', getBranches);
router.post('/institute/create-branch', createBranch);
router.post('/institute/createExam', createExam);
router.get('/institute/exams', getExams);
router.get('/institute/exams/:examId', getExamById);
router.get('/institute/viewexam/:examId', ViewExamById);
router.post('/institute/updateExam', updateExamById);
router.post('/institute/assign-exam-to-branches', assignExamToBranches);
router.post('/institute/assign-exam-to-students', assignExamToStudents);
router.get('/institute/allResults', getAllResults);
router.get('/institute/topPerformers', getTopPerformers);
router.get('/institute/student-report', getStudentReport );
router.get('/institute/exam-summary', getExamSummary  );
router.get('/institute/search-exam', searchExams  );
router.put('/institute/exams/:examId/lock-result', toggleResultLock  );
router.get('/institute/announcements', getAllAnnouncements);
router.get('/institute/exam-assigned-branches', getAssignedBranchesForExam)
router.put('/institute/exams/:examId/enable', toggleExamStatus)
router.get('/institute/search-students', searchStudents )
router.get('/results', authenticateToken, getResults);

router.post('/student/register', studentReg);
router.get('/student/getstudentwithsearch', getStudentWithSearch);
router.post('/student/updatestudent', updateStudent);
router.get('/student/profile', getStudentProfileById);
router.get('/student/exams', getStudentExams );
router.get('/student/results', studentResultById);

router.post('/institute/bulk-upload', bulkRegisterStudents);
router.post('/student/submitExam', submitStudentExam);
router.get('/student/exams/:examId', getExamById);
router.get('/student/student-results', getStudentResults);
router.get('/student/:studentId/exams', getAllStudentExams);
router.get('/student/downloadExam', downloadSubmittedExam);


router.post('/guest/register', registerGuestUser);
router.post('/guest/createExam', createGuestExam);
router.get('/guest/getAllExam', getGuestExamsByGuestCode);
router.get('/guest/getExam/:examId', getGuestExamById);
router.post('/guest/submitExam', submitGuestExam);
router.get('/guest/getAllResults', getGuestExamResults);
export default router;
