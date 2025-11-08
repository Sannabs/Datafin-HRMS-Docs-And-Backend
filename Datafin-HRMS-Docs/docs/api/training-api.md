# Training & Development API Documentation

## Base Endpoint
```
/api/v1/training
```

---

## Courses

### List Courses

**GET** `/api/v1/training/courses`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `filter[difficulty]` | enum | No | beginner, intermediate, advanced |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "crs_550e8400",
      "course_code": "CS101",
      "course_name": "Introduction to React",
      "description": "Learn the fundamentals of React",
      "duration_hours": 20,
      "difficulty_level": "beginner"
    }
  ]
}
```

### Create Course

**POST** `/api/v1/training/courses`

**Request Body:**
```json
{
  "course_code": "CS101",
  "course_name": "Introduction to React",
  "description": "Learn the fundamentals of React",
  "duration_hours": 20,
  "difficulty_level": "beginner",
  "learning_objectives": "Understand React components, hooks, and state management"
}
```

**Response:** `201 Created`

---

## Training Assignments

### List Employee Training

**GET** `/api/v1/employees/{employee_id}/training`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "ta_550e8400",
      "course": {
        "id": "crs_550e8400",
        "course_name": "Introduction to React"
      },
      "assigned_date": "2025-01-15",
      "due_date": "2025-02-15",
      "status": "in_progress"
    }
  ]
}
```

### Assign Training

**POST** `/api/v1/training/assignments`

**Request Body:**
```json
{
  "employee_id": "emp_550e8400",
  "course_id": "crs_550e8400",
  "due_date": "2025-02-15"
}
```

**Response:** `201 Created`

### Complete Training

**POST** `/api/v1/training/assignments/{assignment_id}/complete`

**Request Body:**
```json
{
  "score": 95.0,
  "result_status": "passed"
}
```

**Response:** `200 OK`

---

## Skills

### List Skills

**GET** `/api/v1/training/skills`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "skl_550e8400",
      "skill_name": "React",
      "skill_category": "Frontend Development",
      "description": "React framework and ecosystem"
    }
  ]
}
```

### Get Employee Skills

**GET** `/api/v1/employees/{employee_id}/skills`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "skill": {
        "id": "skl_550e8400",
        "skill_name": "React",
        "skill_category": "Frontend Development"
      },
      "proficiency_level": "advanced",
      "acquired_date": "2024-06-15"
    }
  ]
}
```

### Add Skill

**POST** `/api/v1/employees/{employee_id}/skills`

**Request Body:**
```json
{
  "skill_id": "skl_550e8400",
  "proficiency_level": "advanced",
  "acquired_date": "2025-01-15"
}
```

**Response:** `201 Created`

---

## Permissions

### Required Permissions

| Endpoint | Required Permission |
|----------|---------------------|
| GET /training/courses | `training:read` |
| POST /training/courses | `training:create` |
| GET /employees/{id}/training | `training:read` |
| POST /training/assignments | `training:assign` |

