import React from 'react';
import { Box } from '@mui/material';

const ErrorMessage = ({ show, message, sx }) => {
  if (!show) {
    return null;
  }
  return (
    <Box sx={{ ...sx, color: 'red' }}>
      {message}
    </Box>
  );
};

export default ErrorMessage;
