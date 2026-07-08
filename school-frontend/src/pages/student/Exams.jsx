import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import List    from './exams/List';
import Attempt from './exams/Attempt';
import Result  from './exams/Result';

export default function StudentExams() {
  return (
    <Routes>
      <Route index element={<List />} />
      <Route path=":id/attempt" element={<Attempt />} />
      <Route path=":id/result"  element={<Result />} />
      <Route path="*" element={<Navigate to="." replace />} />
    </Routes>
  );
}
