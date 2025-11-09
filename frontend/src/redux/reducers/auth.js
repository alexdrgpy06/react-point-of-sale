const initialState = {
  tokens: null,
  user: null,
};

export default function auth(state = initialState, action) {
  switch (action.type) {
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        tokens: action.payload.tokens,
        user: action.payload.user,
      };
    case 'LOGOUT_SUCCESS':
      return initialState;
    default:
      return state;
  }
}
