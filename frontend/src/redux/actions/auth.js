export const loginUser = (credentials) => async (dispatch) => {
  try {
    // Simulate API call
    const tokens = { access: 'fake-access-token', refresh: 'fake-refresh-token' };
    const user = { username: credentials.username };
    dispatch({ type: 'LOGIN_SUCCESS', payload: { tokens, user } });
    return Promise.resolve();
  } catch (error) {
    return Promise.reject(error);
  }
};
