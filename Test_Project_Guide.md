# Test Project: Task Manager Microservices

## Project Structure

```
task-manager-microservices/
├── docker-compose.yml
├── k8s/
│   ├── namespace.yaml
│   ├── configmap.yaml
│   ├── secrets.yaml
│   └── services/
│       ├── auth-service/
│       ├── task-service/
│       └── gateway/
├── services/
│   ├── auth-service/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── src/
│   │   └── tests/
│   ├── task-service/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── src/
│   │   └── tests/
│   └── api-gateway/
│       ├── Dockerfile
│       ├── package.json
│       └── src/
├── infrastructure/
│   ├── terraform/
│   └── scripts/
└── docs/
    ├── api-specs/
    └── deployment-guide.md
```

## Implementation Roadmap

### Week 1: Environment Setup

**Day 1-2: GCP Account Setup**
1. Create GCP account and billing
2. Install gcloud CLI
3. Set up first project
4. Enable required APIs

**Commands to run:**
```bash
# Install gcloud CLI (macOS)
brew install --cask google-cloud-sdk

# Initialize gcloud
gcloud init

# Create project
gcloud projects create task-manager-$(date +%s)

# Set project
gcloud config set project YOUR_PROJECT_ID

# Enable APIs
gcloud services enable container.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable storage.googleapis.com
```

**Day 3-4: Local Development Environment**
1. Set up Docker and Docker Compose
2. Create basic Node.js services
3. Set up PostgreSQL locally
4. Test inter-service communication

**Day 5-7: Basic Microservices**
1. Create Auth Service (JWT authentication)
2. Create Task Service (CRUD operations)
3. Set up API Gateway
4. Test locally with Docker Compose

### Week 2: Containerization and Kubernetes

**Day 1-3: Docker and GCR**
1. Create Dockerfiles for each service
2. Build and test containers locally
3. Push to Google Container Registry
4. Set up automated builds

**Day 4-7: GKE Deployment**
1. Create GKE cluster
2. Deploy services to Kubernetes
3. Set up load balancing
4. Configure service discovery

### Week 3: Database and Storage

**Day 1-3: Cloud SQL Setup**
1. Create Cloud SQL instance
2. Set up database schemas
3. Configure connection pooling
4. Implement database migrations

**Day 4-5: Cloud Storage Integration**
1. Set up Cloud Storage buckets
2. Implement file upload service
3. Configure CDN
4. Add image processing

**Day 6-7: Caching with Redis**
1. Set up Cloud Memorystore
2. Implement caching strategies
3. Add session management
4. Optimize performance

### Week 4: Advanced Features

**Day 1-3: Monitoring and Logging**
1. Set up Cloud Monitoring
2. Implement structured logging
3. Create dashboards
4. Set up alerts

**Day 4-5: Security Implementation**
1. Set up IAM roles
2. Implement API authentication
3. Add rate limiting
4. Security scanning

**Day 6-7: CI/CD Pipeline**
1. Set up Cloud Build
2. Implement automated testing
3. Deploy to staging/production
4. Monitor deployments

## Starter Code Templates

### Auth Service (Node.js/Express)

```javascript
// auth-service/src/app.js
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: 5432,
});

// Register endpoint
app.post('/auth/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Save user to database
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, first_name, last_name) VALUES ($1, $2, $3, $4) RETURNING id, email',
      [email, hashedPassword, firstName, lastName]
    );
    
    res.status(201).json({ user: result.rows[0] });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Login endpoint
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user
    const result = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    
    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Verify token endpoint
app.post('/auth/verify', (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ valid: true, user: decoded });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Auth service running on port ${PORT}`);
});
```

### Task Service (Node.js/Express)

```javascript
// task-service/src/app.js
const express = require('express');
const axios = require('axios');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: 5432,
});

// Auth middleware
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    // Verify token with auth service
    const response = await axios.post(
      `${process.env.AUTH_SERVICE_URL}/auth/verify`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    req.user = response.data.user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Get tasks
app.get('/tasks', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM tasks WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.userId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create task
app.post('/tasks', authenticate, async (req, res) => {
  try {
    const { title, description, priority } = req.body;
    const result = await pool.query(
      'INSERT INTO tasks (title, description, priority, user_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [title, description, priority, req.user.userId]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update task
app.put('/tasks/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, priority, status } = req.body;
    
    const result = await pool.query(
      'UPDATE tasks SET title = $1, description = $2, priority = $3, status = $4, updated_at = NOW() WHERE id = $5 AND user_id = $6 RETURNING *',
      [title, description, priority, status, id, req.user.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete task
app.delete('/tasks/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, req.user.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Task service running on port ${PORT}`);
});
```

### Kubernetes Deployment Examples

```yaml
# k8s/services/auth-service/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth-service
  namespace: task-manager
spec:
  replicas: 2
  selector:
    matchLabels:
      app: auth-service
  template:
    metadata:
      labels:
        app: auth-service
    spec:
      containers:
      - name: auth-service
        image: gcr.io/YOUR_PROJECT_ID/auth-service:latest
        ports:
        - containerPort: 3001
        env:
        - name: DB_HOST
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: db-host
        - name: DB_NAME
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: db-name
        - name: DB_USER
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: username
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: password
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: auth-secret
              key: jwt-secret
        livenessProbe:
          httpGet:
            path: /health
            port: 3001
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3001
          initialDelaySeconds: 5
          periodSeconds: 5

---
apiVersion: v1
kind: Service
metadata:
  name: auth-service
  namespace: task-manager
spec:
  selector:
    app: auth-service
  ports:
  - port: 80
    targetPort: 3001
  type: ClusterIP
```

### Docker Compose for Local Development

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:13
    environment:
      POSTGRES_DB: taskmanager
      POSTGRES_USER: taskuser
      POSTGRES_PASSWORD: taskpassword
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init.sql:/docker-entrypoint-initdb.d/init.sql

  redis:
    image: redis:6-alpine
    ports:
      - "6379:6379"

  auth-service:
    build: ./services/auth-service
    ports:
      - "3001:3001"
    environment:
      DB_HOST: postgres
      DB_NAME: taskmanager
      DB_USER: taskuser
      DB_PASSWORD: taskpassword
      JWT_SECRET: your-jwt-secret-key
    depends_on:
      - postgres

  task-service:
    build: ./services/task-service
    ports:
      - "3002:3002"
    environment:
      DB_HOST: postgres
      DB_NAME: taskmanager
      DB_USER: taskuser
      DB_PASSWORD: taskpassword
      AUTH_SERVICE_URL: http://auth-service:3001
    depends_on:
      - postgres
      - auth-service

  api-gateway:
    build: ./services/api-gateway
    ports:
      - "3000:3000"
    environment:
      AUTH_SERVICE_URL: http://auth-service:3001
      TASK_SERVICE_URL: http://task-service:3002
    depends_on:
      - auth-service
      - task-service

volumes:
  postgres_data:
```

## Next Steps

1. **Start with Week 1 activities** - Set up your GCP account and local environment
2. **Follow the code templates** - Use the provided starter code as a foundation
3. **Deploy locally first** - Test everything with Docker Compose before moving to GCP
4. **Gradually move to cloud** - Start with Cloud SQL, then GKE, then add monitoring
5. **Expand functionality** - Add more features as you become comfortable with the architecture

This test project will give you hands-on experience with all the concepts you'll need for your property listing application while keeping the scope manageable for learning.
