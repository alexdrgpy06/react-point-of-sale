import React from 'react';
import { Routes, Route } from 'react-router-dom';
import LoginPage from './components/login/LoginPage';
import HomePage from './components/home/HomePage';

const App = () => (
  <Routes>
    <Route path="/" element={<LoginPage />} />
    <Route path="/home" element={<HomePage />} />
  </Routes>
);

export default App;
