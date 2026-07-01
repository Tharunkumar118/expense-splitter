const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

let students = [
  { id: 1, name: "Rahul", age: 21, course: "CSE" },
  { id: 2, name: "Priya", age: 20, course: "ECE" }
];

app.get("/", (req, res) => {
  res.send("Student API Running");
});

app.get("/students", (req, res) => {
  res.json(students);
});

app.get("/students/:id", (req, res) => {
  const id = Number(req.params.id);
  const student = students.find(s => s.id === id);

  if (!student) {
    return res.status(404).json({ message: "Student not found" });
  }

  res.json(student);
});

app.post("/students", (req, res) => {
  const { name, age, course } = req.body;

  if (!name || !age || !course) {
    return res.status(400).json({ message: "All fields are required" });
  }

  const student = {
    id: students.length + 1,
    name,
    age,
    course
  };

  students.push(student);

  res.status(201).json(student);
});

app.put("/students/:id", (req, res) => {
  const id = Number(req.params.id);
  const student = students.find(s => s.id === id);

  if (!student) {
    return res.status(404).json({ message: "Student not found" });
  }

  student.name = req.body.name;
  student.age = req.body.age;
  student.course = req.body.course;

  res.json(student);
});

app.delete("/students/:id", (req, res) => {
  const id = Number(req.params.id);
  const index = students.findIndex(s => s.id === id);

  if (index === -1) {
    return res.status(404).json({ message: "Student not found" });
  }

  students.splice(index, 1);

  res.json({ message: "Student deleted" });
});

const PORT = 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
