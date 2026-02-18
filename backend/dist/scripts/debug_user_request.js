"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const client_2 = require("../db/client");
const request_service_1 = require("../services/request.service");
async function main() {
    console.log('--- Starting Debug Simulation ---');
    // 1. Create a dummy user
    const userEmail = `debug_${Date.now()}@example.com`;
    console.log(`Creating dummy user: ${userEmail}`);
    const user = await client_2.prisma.user.create({
        data: {
            name: 'Debug User',
            email: userEmail,
            password: 'hashedpassword',
        }
    });
    try {
        // 2. Create a USER_UPDATE request
        console.log('Creating USER_UPDATE request...');
        const request = await client_2.prisma.changeRequest.create({
            data: {
                type: client_1.RequestType.USER_UPDATE,
                status: client_1.RequestStatus.PENDING,
                requesterId: user.id,
                payload: {
                    firstName: 'Updated',
                    lastName: 'Name',
                    country: 'DebugLand'
                }
            }
        });
        console.log(`Request created: ${request.id}`);
        // 3. Try to Approve
        console.log('Attempting to APPROVE request...');
        try {
            await (0, request_service_1.approveRequest)(request.id);
            console.log('✅ Success: Request Approved');
        }
        catch (error) {
            console.error('❌ Error Approving Request:');
            console.error(error);
        }
        // 4. Create another request to test Reject
        console.log('Creating second request for REJECT test...');
        const request2 = await client_2.prisma.changeRequest.create({
            data: {
                type: client_1.RequestType.USER_UPDATE,
                status: client_1.RequestStatus.PENDING,
                requesterId: user.id,
                payload: { firstName: 'RejectMe' }
            }
        });
        console.log('Attempting to REJECT request...');
        try {
            await (0, request_service_1.rejectRequest)(request2.id, 'Debug rejection');
            console.log('✅ Success: Request Rejected');
        }
        catch (error) {
            console.error('❌ Error Rejecting Request:');
            console.error(error);
        }
    }
    catch (e) {
        console.error('Unexpected error in flow:', e);
    }
    finally {
        // Cleanup
        console.log('Cleaning up...');
        await client_2.prisma.changeRequest.deleteMany({ where: { requesterId: user.id } });
        await client_2.prisma.user.delete({ where: { id: user.id } });
        await client_2.prisma.$disconnect();
    }
}
main();
