import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface User {
  id: string;
  username: string;
  email: string;
}

interface UserState {
  currentUser: User | null;
  accessToken: string | null;
  isFetching: boolean;
  error: string | null;
}

const initialState: UserState = {
  currentUser: null,
  accessToken: null,
  isFetching: false,
  error: null,
};

const userSlice = createSlice({
  name: "user",
  initialState,
  reducers: {
    loginStart: (state) => {
      state.isFetching = true;
    },
    loginSuccess: (
      state,
      action: PayloadAction<{ user: User; accessToken: string }>
    ) => {
      state.isFetching = false;
      state.currentUser = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.error = null;
    },
    loginFailure: (state, action: PayloadAction<string>) => {
      state.isFetching = false;
      state.error = action.payload;
    },
    logout: (state) => {
      state.currentUser = null;
      state.accessToken = null;
      state.error = null;
    },
  },
});

export const { loginStart, loginSuccess, loginFailure, logout } =
  userSlice.actions;
export default userSlice.reducer;
