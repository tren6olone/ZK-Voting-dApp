import { NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { db } from "../utils/firebaseAdmin";

export async function GET() {
  try {
    // Fetch all verified members, ordered strictly by their treeIndex!
    const snapshot = await db.collection("organizations")
                             .doc("org_1")
                             .collection("members")
                             .where("status", "==", "verified")
                             .orderBy("treeIndex", "asc")
                             .get();

    const commitments: string[] = [];
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.identityCommitment) {
        commitments.push(data.identityCommitment);
      }
    });

    return NextResponse.json({ success: true, commitments });

  } catch (error) {
    console.error("Failed to fetch group:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}