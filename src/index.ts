import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import routes from './routes/index.route.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/', routes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on port : ${PORT}`);
});