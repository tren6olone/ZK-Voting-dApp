import { NextResponse } from "next/server";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

export async function POST(req: Request) {
  try {
    const { hashes } = await req.json();
    
    if (!hashes || hashes.length === 0) {
      return NextResponse.json({ success: true, metadata: {} });
    }
    
    const metadata: Record<string, unknown> = {};

    // Fetch the text for each hash from Firebase
    await Promise.all(hashes.map(async (hash: string) => {
      const doc = await db.collection("proposals").doc(hash).get();
      if (doc.exists) {
        metadata[hash] = doc.data();
      }
    }));

    return NextResponse.json({ success: true, metadata });

  } catch (error: unknown) {
  console.error("Failed to fetch proposal metadata:", error);

  let message = "Unknown error occurred";

  if (error instanceof Error) {
    message = error.message;
  } else if (
    typeof error === "object" &&
    error !== null &&
    "message" in error
  ) {
    message = String((error as { message: unknown }).message);
  }

  return NextResponse.json(
    { success: false, error: message },
    { status: 500 }
  );
}
}