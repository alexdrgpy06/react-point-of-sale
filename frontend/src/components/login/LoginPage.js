import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { connect } from 'react-redux';
import {
  Container,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Box,
} from '@mui/material';
import ErrorMessage from '../controls/messages/ErrorMessage';
import { loginUser } from '../../redux/actions/auth';

const LoginPage = ({ isLoggedIn, loginUser }) => {
  const [data, setData] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const usernameRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoggedIn) {
      navigate('/home');
    }
  }, [isLoggedIn, navigate]);

  const hasErrors = () => errors.global && errors.global.length > 0;

  const onSubmit = async e => {
    e.preventDefault();
    const validationErrors = validate(data);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length !== 0) {
      return;
    }
    setLoading(true);
    try {
      await loginUser({ ...data });
      navigate('/');
    } catch (error) {
      setErrors({ global: error.message });
      setData({ username: '', password: '' });
      setLoading(false);
      if (usernameRef.current) {
        usernameRef.current.focus();
      }
    }
  };

  const onChange = e => {
    setData({ ...data, [e.target.name]: e.target.value });
  };

  const validate = data => {
    const newErrors = {};
    if (!data.username || data.username.length === 0) {
      newErrors.username = 'Enter username';
    }
    if (!data.password || data.password.length === 0) {
      newErrors.password = 'Enter password';
    }
    return newErrors;
  };

  return (
    <Container
      component="main"
      maxWidth="xs"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        height: '100vh',
      }}
    >
      <Card sx={{ boxShadow: 3, p: 2 }}>
        <CardContent>
          <Typography component="h1" variant="h5" align="center" gutterBottom>
            Easy POS
          </Typography>
          <Typography component="p" variant="body2" align="center" gutterBottom>
            Welcome back! Please sign in.
          </Typography>
          <Box component="form" onSubmit={onSubmit} sx={{ mt: 1 }}>
            <ErrorMessage
              show={hasErrors()}
              message={errors.global}
              sx={{ mb: 2 }}
            />
            <TextField
              inputRef={usernameRef}
              error={!!errors.username}
              helperText={errors.username}
              name="username"
              value={data.username}
              fullWidth
              label="Username"
              margin="normal"
              onChange={onChange}
              autoFocus
            />
            <TextField
              error={!!errors.password}
              helperText={errors.password}
              name="password"
              value={data.password}
              fullWidth
              label="Password"
              type="password"
              margin="normal"
              onChange={onChange}
            />
            <Box sx={{ position: 'relative', mt: 3 }}>
              <Button
                type="submit"
                fullWidth
                variant="contained"
                color="primary"
                disabled={loading}
              >
                Sign In
              </Button>
              {loading && (
                <CircularProgress
                  size={24}
                  sx={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    marginTop: '-12px',
                    marginLeft: '-12px',
                  }}
                />
              )}
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Container>
  );
};

const mapStateToProps = state => ({
  isLoggedIn: state.auth !== undefined ? !!state.auth.tokens : false,
});

export default connect(mapStateToProps, { loginUser })(LoginPage);
