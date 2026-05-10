import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AppLayout from './components/layout/AppLayout';

// ── Auth Pages ────────────────────────────────────────────────────────────────
const Login          = lazy(() => import('./pages/auth/Login'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const VerifyOtp      = lazy(() => import('./pages/auth/VerifyOtp'));
const NewPassword    = lazy(() => import('./pages/auth/NewPassword'));
const ResetPassword  = lazy(() => import('./pages/auth/ResetPassword'));
const MagicLogin     = lazy(() => import('./pages/auth/MagicLogin'));

// ── Super Admin ───────────────────────────────────────────────────────────────
const SADashboard      = lazy(() => import('./pages/super-admin/Dashboard'));
const SASchools        = lazy(() => import('./pages/super-admin/Schools'));
const SASchoolForm     = lazy(() => import('./pages/super-admin/SchoolForm'));
const SAUsers          = lazy(() => import('./pages/super-admin/Users'));
const SAPermissions    = lazy(() => import('./pages/super-admin/Permissions'));
const SANotifications  = lazy(() => import('./pages/super-admin/Notifications'));

// ── Admin ─────────────────────────────────────────────────────────────────────
const ADashboard    = lazy(() => import('./pages/admin/Dashboard'));
const ATeachers     = lazy(() => import('./pages/admin/Teachers'));
const AStudents     = lazy(() => import('./pages/admin/Students'));
const AClasses      = lazy(() => import('./pages/admin/Classes'));
const ASections     = lazy(() => import('./pages/admin/Sections'));
const ASectionDetail= lazy(() => import('./pages/admin/SectionDetail'));
const ASubjects     = lazy(() => import('./pages/admin/Subjects'));
const AAcademicYears= lazy(() => import('./pages/admin/AcademicYears'));
const ATimetable    = lazy(() => import('./pages/admin/Timetable'));
const ANotifications= lazy(() => import('./pages/admin/Notifications'));
const AResults      = lazy(() => import('./pages/admin/Results'));
const ALeave        = lazy(() => import('./pages/admin/Leave'));
const ADocuments    = lazy(() => import('./pages/admin/Documents'));
const AHolidays     = lazy(() => import('./pages/admin/Holidays'));
const AAttendance   = lazy(() => import('./pages/admin/Attendance'));
const AAdmins       = lazy(() => import('./pages/admin/Admins'));
const AReports      = lazy(() => import('./pages/admin/Reports'));

// ── Shared ────────────────────────────────────────────────────────────────────
const SharedNotifications = lazy(() => import('./pages/shared/Notifications'));

// ── Teacher ───────────────────────────────────────────────────────────────────
const TDashboard    = lazy(() => import('./pages/teacher/Dashboard'));
const TMySection    = lazy(() => import('./pages/teacher/MySection'));
const TAttendance   = lazy(() => import('./pages/teacher/Attendance'));
const TTimetable    = lazy(() => import('./pages/teacher/Timetable'));
const TExams        = lazy(() => import('./pages/teacher/Exams'));
const TResults      = lazy(() => import('./pages/teacher/Results'));
const TLeave        = lazy(() => import('./pages/teacher/Leave'));
const TDocuments    = lazy(() => import('./pages/teacher/Documents'));
const THolidays     = lazy(() => import('./pages/teacher/Holidays'));

// ── Student ───────────────────────────────────────────────────────────────────
const SDashboard    = lazy(() => import('./pages/student/Dashboard'));
const SMyClass      = lazy(() => import('./pages/student/MyClass'));
const SAttendance   = lazy(() => import('./pages/student/Attendance'));
const STimetable    = lazy(() => import('./pages/student/Timetable'));
const SExams        = lazy(() => import('./pages/student/Exams'));
const SResults      = lazy(() => import('./pages/student/Results'));
const SDocuments    = lazy(() => import('./pages/student/Documents'));
const SHolidays     = lazy(() => import('./pages/student/Holidays'));
const SFees         = lazy(() => import('./pages/fees/student/MyFees'));
const SLibrary      = lazy(() => import('./pages/library/student/Dashboard'));
const SLibSearch    = lazy(() => import('./pages/library/student/Search'));
const SLibMyBooks   = lazy(() => import('./pages/library/student/MyBooks'));
const SLibMyFines   = lazy(() => import('./pages/library/student/MyFines'));

// ── Parent ────────────────────────────────────────────────────────────────────
const PDashboard    = lazy(() => import('./pages/parent/Dashboard'));
const PChildClass   = lazy(() => import('./pages/parent/ChildClass'));
const PAttendance   = lazy(() => import('./pages/parent/ChildAttendance'));
const PExams        = lazy(() => import('./pages/parent/Exams'));
const PResults      = lazy(() => import('./pages/parent/Results'));
const PDocuments    = lazy(() => import('./pages/parent/Documents'));
const PHolidays     = lazy(() => import('./pages/parent/Holidays'));
const PFees         = lazy(() => import('./pages/parent/ChildFees'));

// ── Fees (Admin) ──────────────────────────────────────────────────────────────
const FAdminDash    = lazy(() => import('./pages/fees/admin/Dashboard'));
const FCategories   = lazy(() => import('./pages/fees/admin/FeeCategories'));
const FHeads        = lazy(() => import('./pages/fees/admin/FeeHeads'));
const FStructures   = lazy(() => import('./pages/fees/admin/FeeStructures'));
const FFineRules    = lazy(() => import('./pages/fees/admin/FineRules'));
const FConcessions  = lazy(() => import('./pages/fees/admin/Concessions'));
const FStudentFees  = lazy(() => import('./pages/fees/admin/StudentFees'));
const FPayments     = lazy(() => import('./pages/fees/admin/Payments'));
const FReports      = lazy(() => import('./pages/fees/admin/Reports'));

// ── Payroll ───────────────────────────────────────────────────────────────────
const PayDashboard  = lazy(() => import('./pages/payroll/admin/Dashboard'));
const PayStructures = lazy(() => import('./pages/payroll/admin/Structures'));
const PayAssignments= lazy(() => import('./pages/payroll/admin/Assignments'));
const PayRuns       = lazy(() => import('./pages/payroll/admin/Runs'));
const PayMyCtc      = lazy(() => import('./pages/payroll/teacher/MyCtc'));
const PayMyPayslips = lazy(() => import('./pages/payroll/teacher/Payslips'));

// ── Library ───────────────────────────────────────────────────────────────────
const LibDashboard  = lazy(() => import('./pages/library/librarian/Dashboard'));
const LibBooks      = lazy(() => import('./pages/library/librarian/Books'));
const LibCirculation= lazy(() => import('./pages/library/librarian/Circulation'));
const LibReservations=lazy(() => import('./pages/library/librarian/Reservations'));
const LibFines      = lazy(() => import('./pages/library/librarian/Fines'));
const LibPolicy     = lazy(() => import('./pages/library/librarian/Policy'));

// ── Profile ───────────────────────────────────────────────────────────────────
const Profile = lazy(() => import('./pages/Profile'));

// ── Spinner fallback ──────────────────────────────────────────────────────────
const PageLoader = () => (
  <div className="loading-page">
    <div className="spinner" />
    <span>Loading…</span>
  </div>
);

const roleHome = {
  super_admin:  '/super-admin/dashboard',
  school_admin: '/admin/dashboard',
  teacher:      '/teacher/dashboard',
  student:      '/student/dashboard',
  parent:       '/parent/dashboard',
};

// ── Protected Route (must be logged in) ───────────────────────────────────────
const Protected = ({ children, roles }) => {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.isFirstLogin) return <Navigate to="/reset-password" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
};

// ── Guest Only (redirect to dashboard if already logged in) ───────────────────
const GuestOnly = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (user) return <Navigate to={roleHome[user.role] || '/'} replace />;
  return children;
};

const HomeRedirect = () => {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={roleHome[user.role] || '/login'} replace />;
};

export default function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public — redirect to dashboard if already logged in */}
          <Route path="/login"          element={<GuestOnly><Login /></GuestOnly>} />
          <Route path="/forgot-password"element={<GuestOnly><ForgotPassword /></GuestOnly>} />
          <Route path="/verify-otp"     element={<GuestOnly><VerifyOtp /></GuestOnly>} />
          <Route path="/new-password"   element={<GuestOnly><NewPassword /></GuestOnly>} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/auth/magic/:token" element={<MagicLogin />} />
          <Route path="/" element={<HomeRedirect />} />

          {/* Super Admin */}
          <Route path="/super-admin" element={
            <Protected roles={['super_admin']}><AppLayout /></Protected>
          }>
            <Route path="dashboard"    element={<SADashboard />} />
            <Route path="schools"      element={<SASchools />} />
            <Route path="schools/create" element={<SASchoolForm />} />
            <Route path="schools/:id/edit" element={<SASchoolForm />} />
            <Route path="users"         element={<SAUsers />} />
            <Route path="permissions"   element={<SAPermissions />} />
            <Route path="notifications" element={<SANotifications />} />
          </Route>

          {/* Admin */}
          <Route path="/admin" element={
            <Protected roles={['school_admin']}><AppLayout /></Protected>
          }>
            <Route path="dashboard"       element={<ADashboard />} />
            <Route path="teachers"        element={<ATeachers />} />
            <Route path="students"        element={<AStudents />} />
            <Route path="admins"          element={<AAdmins />} />
            <Route path="academic-years"  element={<AAcademicYears />} />
            <Route path="classes"         element={<AClasses />} />
            <Route path="classes/:id"     element={<ASections />} />
            <Route path="sections/:id"    element={<ASectionDetail />} />
            <Route path="subjects"        element={<ASubjects />} />
            <Route path="timetable"       element={<ATimetable />} />
            <Route path="notifications"   element={<ANotifications />} />
            <Route path="results/*"       element={<AResults />} />
            <Route path="leave/*"         element={<ALeave />} />
            <Route path="documents"       element={<ADocuments />} />
            <Route path="holidays"        element={<AHolidays />} />
            <Route path="attendance"      element={<AAttendance />} />
            <Route path="reports"         element={<AReports />} />
            {/* Fees */}
            <Route path="fees/dashboard"      element={<FAdminDash />} />
            <Route path="fees/categories"     element={<FCategories />} />
            <Route path="fees/heads"          element={<FHeads />} />
            <Route path="fees/structures"     element={<FStructures />} />
            <Route path="fees/fine-rules"     element={<FFineRules />} />
            <Route path="fees/concessions"    element={<FConcessions />} />
            <Route path="fees/student-fees"   element={<FStudentFees />} />
            <Route path="fees/payments"       element={<FPayments />} />
            <Route path="fees/reports"        element={<FReports />} />
            {/* Payroll */}
            <Route path="payroll/dashboard"   element={<PayDashboard />} />
            <Route path="payroll/structures"  element={<PayStructures />} />
            <Route path="payroll/assignments" element={<PayAssignments />} />
            <Route path="payroll/runs"        element={<PayRuns />} />
            {/* Library */}
            <Route path="library/dashboard"   element={<LibDashboard />} />
            <Route path="library/books"       element={<LibBooks />} />
            <Route path="library/circulation" element={<LibCirculation />} />
            <Route path="library/reservations"element={<LibReservations />} />
            <Route path="library/fines"       element={<LibFines />} />
            <Route path="library/policy"      element={<LibPolicy />} />
          </Route>

          {/* Teacher */}
          <Route path="/teacher" element={
            <Protected roles={['teacher']}><AppLayout /></Protected>
          }>
            <Route path="dashboard"    element={<TDashboard />} />
            <Route path="my-section"   element={<TMySection />} />
            <Route path="attendance"   element={<TAttendance />} />
            <Route path="timetable"    element={<TTimetable />} />
            <Route path="exams/*"      element={<TExams />} />
            <Route path="results/*"    element={<TResults />} />
            <Route path="leave"        element={<TLeave />} />
            <Route path="documents"    element={<TDocuments />} />
            <Route path="payroll/ctc"      element={<PayMyCtc />} />
            <Route path="payroll/payslips" element={<PayMyPayslips />} />
            <Route path="library"          element={<SLibrary />} />
            <Route path="library/search"   element={<SLibSearch />} />
            <Route path="library/my-books" element={<SLibMyBooks />} />
            <Route path="library/my-fines" element={<SLibMyFines />} />
            <Route path="holidays"         element={<THolidays />} />
            <Route path="notifications"    element={<SharedNotifications />} />
          </Route>

          {/* Student */}
          <Route path="/student" element={
            <Protected roles={['student']}><AppLayout /></Protected>
          }>
            <Route path="dashboard"        element={<SDashboard />} />
            <Route path="my-class"         element={<SMyClass />} />
            <Route path="attendance"       element={<SAttendance />} />
            <Route path="timetable"        element={<STimetable />} />
            <Route path="exams/*"          element={<SExams />} />
            <Route path="results/*"        element={<SResults />} />
            <Route path="documents"        element={<SDocuments />} />
            <Route path="holidays"         element={<SHolidays />} />
            <Route path="fees/*"           element={<SFees />} />
            <Route path="library"          element={<SLibrary />} />
            <Route path="library/search"   element={<SLibSearch />} />
            <Route path="library/my-books" element={<SLibMyBooks />} />
            <Route path="library/my-fines" element={<SLibMyFines />} />
            <Route path="notifications"    element={<SharedNotifications />} />
          </Route>

          {/* Parent */}
          <Route path="/parent" element={
            <Protected roles={['parent']}><AppLayout /></Protected>
          }>
            <Route path="dashboard"        element={<PDashboard />} />
            <Route path="child-class"      element={<PChildClass />} />
            <Route path="child-attendance" element={<PAttendance />} />
            <Route path="exams"            element={<PExams />} />
            <Route path="results/*"        element={<PResults />} />
            <Route path="documents"        element={<PDocuments />} />
            <Route path="holidays"         element={<PHolidays />} />
            <Route path="child-fees"       element={<PFees />} />
            <Route path="notifications"    element={<SharedNotifications />} />
          </Route>

          {/* Profile (all roles) */}
          <Route path="/profile" element={
            <Protected><AppLayout /></Protected>
          }>
            <Route index element={<Profile />} />
          </Route>

          {/* 404 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}
