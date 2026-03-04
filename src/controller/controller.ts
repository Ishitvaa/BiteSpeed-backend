import { z } from 'zod';
import { identify } from '../service/service.js';
import type { Request, Response } from 'express';

const identifySchema = z.object({
  email: z.email().optional().nullable(),
  phone_no : z.string().optional().nullable(),
}).refine(
  (data) => data.email || data.phone_no,
  { message: "At least one of email or phoneNumber must be provided" }
);

export const identifyController = async (req: Request, res: Response): Promise<void> => {
  try {
    const requiredBody = identifySchema.safeParse(req.body);

    if (!requiredBody.success) {
        res.status(403).json({
            error : 'Invalid Input Format'
        });
        return;
    }

    const { email, phone_no } = requiredBody.data;

    const result = await identify({
      email: email || undefined,
      phone_no: phone_no || undefined
    });

    res.status(200).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation failed',
        details: error.message,
      });
      return;
    }

    console.error('Error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};