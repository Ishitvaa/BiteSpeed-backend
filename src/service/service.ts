import { prismaClient } from '../db/db.js';

interface IdentifyRequest {
  email: string | undefined;
  phone_no: string | undefined;
}

type ContactResponse = {
  contact: {
    primaryContactId: number;
    emails: string[];
    phoneNumbers: string[];
    secondaryContactIds: number[];
  };
}

// Helper function to get all linked contacts
const getAllLinkedContacts = async (primaryId: number) => {
  const primary = await prismaClient.contact.findUnique({ where: { id: primaryId } });
  const secondaries = await prismaClient.contact.findMany({
    where: { LinkedId: primaryId },
    orderBy: { createdAt: 'asc' },
  });
  return [primary!, ...secondaries];
};

// Helper function to format response
const formatResponse = (contacts: any[]): ContactResponse => {
  const primary = contacts.find(c => c.LinkedPrecedence === 'primary') || contacts[0];
  const secondaries = contacts.filter(c => c.LinkedPrecedence === 'secondary');

  const emails = Array.from(new Set(contacts.map(c => c.email).filter(Boolean))) as string[];
  const phoneNumbers = Array.from(new Set(contacts.map(c => c.phone_no).filter(Boolean))) as string[];

  // Ensure primary's email and phone are first
  if (primary.email && emails.includes(primary.email)) {
    emails.splice(emails.indexOf(primary.email), 1);
    emails.unshift(primary.email);
  }
  if (primary.phone_no && phoneNumbers.includes(primary.phone_no)) {
    phoneNumbers.splice(phoneNumbers.indexOf(primary.phone_no), 1);
    phoneNumbers.unshift(primary.phone_no);
  }

  return {
    contact: {
      primaryContactId: primary.id,
      emails,
      phoneNumbers,
      secondaryContactIds: secondaries.map(c => c.id),
    },
  };
};

// Main identify function
export const identify = async (data: IdentifyRequest): Promise<ContactResponse> => {
  const { email, phone_no } = data;

  // At least one should be provided (validation already done in controller)
  if (!email && !phone_no) {
    throw new Error("At least one of email or phone_no must be provided");
  }

  // Find all contacts matching email or phone
  const matchingContacts = await prismaClient.contact.findMany({
    where: {
      OR: [
        email ? { email } : {},
        phone_no ? { phone_no } : {},
      ].filter(condition => Object.keys(condition).length > 0),
    },
    orderBy: { createdAt: 'asc' },
  });

  // Case 1: No existing contacts - create new primary
  if (matchingContacts.length === 0) {
    const newContact = await prismaClient.contact.create({
      data: {
        email : email ?? null,
        phone_no : phone_no ?? null,
        LinkedPrecedence: "primary"
      },
    });
    return formatResponse([newContact]);
  }

  // Get primary and secondary contacts
  const primaryContacts = matchingContacts.filter(c => c.LinkedPrecedence === 'primary');
  const secondaryContacts = matchingContacts.filter(c => c.LinkedPrecedence === 'secondary');

  // Find the oldest primary
  let oldestPrimary = primaryContacts.length > 0 ? primaryContacts[0] : null;

  // If only secondaries exist, fetch their primary
  if (!oldestPrimary && secondaryContacts.length > 0) {
    oldestPrimary = await prismaClient.contact.findUnique({
      where: { id: secondaryContacts[0]?.LinkedId! },
    });
  }

  // Case 2: Multiple primaries - merge them
  if (primaryContacts.length > 1) {
    const [primary, ...otherPrimaries] = primaryContacts;

    if (!primary) {
        throw new Error('no Primary Contacts');
    }

    for (const contact of otherPrimaries) {
      // Convert primary to secondary
      await prismaClient.contact.update({
        where: { id: contact.id },
        data: {
          LinkedId: primary.id,
          LinkedPrecedence: "secondary",
          updatedAt: new Date()
        },
      });

      // Update all children to point to new primary
      await prismaClient.contact.updateMany({
        where: { LinkedId: contact.id },
        data: { LinkedId: primary.id, updatedAt: new Date() },
      });
    }

    oldestPrimary = primary;
  }

  // Case 3: Check if we need to create new secondary
  const exactMatch = matchingContacts.some(
    c => c.email === (email || null) && c.phone_no === (phone_no || null)
  );

  if (!exactMatch && oldestPrimary) {
    const hasNewEmail = email && !matchingContacts.some(c => c.email === email);
    const hasNewPhone = phone_no && !matchingContacts.some(c => c.phone_no === phone_no);

    if (hasNewEmail || hasNewPhone) {
      await prismaClient.contact.create({
        data: {
          email : email ?? null,
          phone_no : phone_no ?? null,
          LinkedId: oldestPrimary.id,
          LinkedPrecedence: 'secondary',
        },
      });
    }
  }

  // Fetch all linked contacts
  const allContacts = await getAllLinkedContacts(oldestPrimary!.id);
  return formatResponse(allContacts);
};