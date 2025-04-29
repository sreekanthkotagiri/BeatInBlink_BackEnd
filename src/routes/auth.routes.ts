import express from 'express';
import { instituteReg, loginUser, refreshAccessToken, logoutUser, studentReg, getStudentById, getExams, getDashBoard, getResults, createExam, getExamById, updateExamById, bulkRegisterStudents, getBranches, createBranch, assignExamToBranches, updateStudent, ViewExamById, getAllAnnouncements, enableExamToBranches, allExams, getAllStudentExams, downloadSubmittedExam  } from '../controllers/auth.controller'
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
router.post('/institute/createbranch', createBranch);
router.get('/institute/announcements', getAllAnnouncements);
router.get('/results', authenticateToken, getResults);
router.post('/institute/createExam', createExam);
router.get('/institute/exams', getExams);
router.get('/institute/exams/:examId', getExamById);
router.get('/institute/viewexam/:examId', ViewExamById);
router.post('/institute/updateExam', updateExamById);
router.post('/institute/enableExamAccess', enableExamToBranches);


router.get('/student/getstudentwithsearch', getStudentWithSearch);
router.post('/student/updatestudent', updateStudent);
router.get('/students', getStudentById);
router.get('/student/results', studentResultById);
router.post('/student-register', studentReg);
router.post('/studentbulkregister', bulkRegisterStudents);
router.post('/student/submitExam', submitStudentExam);
router.get('/student/exams/:examId', getExamById);
router.get('/student/allStudentExams', getAllStudentExams);
router.get('/student/downloadExam', downloadSubmittedExam);


router.post('/guest/register', registerGuestUser);
router.post('/guest/createExam', createGuestExam);
router.get('/guest/getAllExam', getGuestExamsByGuestCode);
router.get('/guest/getExam/:examId', getGuestExamById);
router.post('/guest/submitExam', submitGuestExam);
router.get('/guest/getAllResults', getGuestExamResults);
export default router;
