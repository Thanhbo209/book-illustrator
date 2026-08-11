export interface ApiErrorBody {
  error: {
    message: string;
    code?: string;
  };
}

export interface LoginRequest {
  name: string;
  email: string;
}

export interface CreateProjectRequest {
  title: string;
  bookText: string;
}

export interface StyleStepRequest {
  style?: string;
}
