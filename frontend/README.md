# Frontend README

This is a Next.js frontend application for the Task Manager microservices project.

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env.local
```

3. Update the `.env.local` file with your API URL:
```
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
```

4. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:3100`.

## Features

- User authentication (register/login/logout)
- Task management (CRUD operations)
- Task filtering and search
- Task statistics dashboard
- File upload for task attachments
- Responsive design with Tailwind CSS

## Project Structure

```
src/
├── app/              # Next.js app router pages
├── components/       # Reusable React components
├── hooks/           # Custom React hooks
├── lib/             # API functions and utilities
└── types/           # TypeScript type definitions
```

## API Integration

The frontend communicates with the backend microservices through the API Gateway at `http://localhost:3000/api`.

## Authentication

Authentication is handled using JWT tokens stored in HTTP-only cookies for security.
