import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import List            from './exams/List';
import Questions       from './exams/Questions';
import Submissions     from './exams/Submissions';
import StudentResponse from './exams/StudentResponse';
import Analytics       from './exams/Analytics';
import Approval        from './exams/Approval';

export default function TeacherExams() {
  return (
    <Routes>
      <Route index element={<List />} />
      <Route path=":id/questions"              element={<Questions />} />
      <Route path=":id/submissions"            element={<Submissions />} />
      <Route path=":id/submissions/:studentId" element={<StudentResponse />} />
      <Route path=":id/analytics"              element={<Analytics />} />
      <Route path=":id/approval"               element={<Approval />} />
      <Route path="*" element={<Navigate to="." replace />} />
    </Routes>
  );
}
