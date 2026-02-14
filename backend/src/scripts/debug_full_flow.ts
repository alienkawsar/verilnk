
import 'dotenv/config';
import { PrismaClient, RequestType, RequestStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    console.log('--- SYSTEM DIAGNOSTIC START ---');

    // 1. Check for Orphaned Requests (Causes Dashboard Crash)
    console.log('\n[1] Checking for Invalid Requests...');
    const allRequests = await prisma.changeRequest.findMany({
        where: { status: 'PENDING' },
        include: { requester: true, organization: true }
    });

    let orphanedCount = 0;
    allRequests.forEach(r => {
        if (!r.requester) {
            console.error(`❌ Found Request ${r.id} with MISSING REQUESTER (User ID: ${r.requesterId})`);
            orphanedCount++;
        }
    });

    if (orphanedCount > 0) {
        console.log(`⚠️ CRITICAL: Found ${orphanedCount} orphaned requests. This crashes the frontend.`);
    } else {
        console.log('✅ No orphaned requests found.');
    }

    // 2. Simulate User Approval Flow
    console.log('\n[2] Simulating User Approval Transaction...');

    // Create Test User
    const userEmail = `sys_test_${Date.now()}@test.com`;
    const user = await prisma.user.create({
        data: {
            name: 'System Test User',
            email: userEmail,
            password: 'hashedpassword'
        }
    });
    console.log(`Created Test User: ${user.id}`);

    // Create Test Request
    const request = await prisma.changeRequest.create({
        data: {
            type: RequestType.USER_UPDATE,
            requesterId: user.id,
            payload: {
                firstName: 'Test',
                lastName: 'Approved',
                country: 'TestCountry',
                password: 'newpassword123'
            }
        }
    });
    console.log(`Created Test Request: ${request.id}`);

    // Execute Approval Logic MANUALLY (Replicating service logic exact steps)
    console.log('Executing Transaction Logic...');

    try {
        await prisma.$transaction(async (tx) => {
            console.log('  > Transaction Started');

            // Step A: Fetch & Verify
            const currentReq = await tx.changeRequest.findUnique({ where: { id: request.id } });
            if (!currentReq) throw new Error('Request disappeared inside tx');
            console.log('  > Request Fetched');

            const payload = currentReq.payload as any;

            // Step B: User Update Logic
            console.log('  > preparing update data...');
            const updateData: any = {};
            if (payload.firstName) updateData.firstName = payload.firstName;
            if (payload.lastName) updateData.lastName = payload.lastName;
            if (payload.country) updateData.country = payload.country;

            // Password Hash check
            if (payload.password) {
                console.log('  > Hashing password...');
                updateData.password = await bcrypt.hash(payload.password, 10);
                console.log('  > Password hashed');
            }

            console.log('  > Update Data:', JSON.stringify(updateData, null, 2));

            // Step C: Perform Update
            console.log('  > Updating User...');
            await tx.user.update({
                where: { id: currentReq.requesterId },
                data: updateData
            });
            console.log('  > User Updated');

            // Step D: Close Request
            console.log('  > closing request...');
            await tx.changeRequest.update({
                where: { id: request.id },
                data: { status: RequestStatus.APPROVED }
            });
            console.log('  > Request Closed');
        });
        console.log('✅ Transaction SUCCESS');

    } catch (error) {
        console.error('❌ Transaction FAILED with error:');
        console.error(error);
    } finally {
        // Cleanup
        console.log('\n[3] Cleanup...');
        await prisma.changeRequest.deleteMany({ where: { requesterId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
        await prisma.$disconnect();
    }
}

main().catch(e => console.error(e));
