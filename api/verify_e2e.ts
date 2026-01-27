import axios from 'axios';

const API_URL = 'http://localhost:3001';
const GARAGE_ENDPOINT = 'http://192.168.88.60:3903';
const GARAGE_TOKEN = 'W7z2s/jx/vubvFqbC3yWJTkAWbi4LmoonHAY+9quYlg=';
const TEST_PASSWORD = 'admin'; // Default

async function runTest() {
    console.log('🚀 Starting End-to-End Verification...');

    try {
        // 1. Health Check of BFF
        console.log('\nStep 1: Checking BFF Health...');
        const health = await axios.get(`${API_URL}/health`);
        console.log('✅ BFF Health:', health.data);

        // 2. Login
        console.log('\nStep 2: Logging in...');
        const loginRes = await axios.post(`${API_URL}/auth/login`, { password: TEST_PASSWORD });
        const token = loginRes.data.token;
        console.log('✅ Login Successful. Token obtained.');
        const headers = { Authorization: `Bearer ${token}` };

        // 3. Add Cluster
        console.log('\nStep 3: Adding Garage Cluster...');
        // Check if exists first to avoid dupes in re-runs?
        const listRes = await axios.get(`${API_URL}/clusters`, { headers });
        let clusterId;
        const existing = listRes.data.find((c: any) => c.endpoint === GARAGE_ENDPOINT);

        if (existing) {
            console.log('ℹ️ Cluster already exists, using ID:', existing.id);
            clusterId = existing.id;
        } else {
            const createRes = await axios.post(`${API_URL}/clusters`, {
                name: 'Test Garage Node',
                endpoint: GARAGE_ENDPOINT,
                region: 'test-region',
                adminToken: GARAGE_TOKEN
            }, { headers });
            clusterId = createRes.data.id;
            console.log('✅ Cluster Added. ID:', clusterId);
        }

        // 4. Check Cluster Status via Proxy
        console.log('\nStep 4: Checking Cluster Status (Proxy)...');
        try {
            const statusRes = await axios.get(`${API_URL}/proxy/${clusterId}/health`, { headers });
            console.log('✅ Cluster Health Status:', statusRes.data.status);
        } catch (err: any) {
            console.error('❌ Failed to get cluster health:', err.response?.status, err.response?.data);
            // Continue?
        }

        // 5. Check Nodes
        console.log('\nStep 5: Checking Nodes...');
        try {
            const statusRes = await axios.get(`${API_URL}/proxy/${clusterId}/v2/status`, { headers });
            console.log('✅ Node Status response received.');
            console.log('   Known Nodes:', statusRes.data.knownNodes);
            console.log('   Healthy Nodes:', statusRes.data.healthyNodes);
        } catch (err: any) {
            console.error('❌ Failed to get node status:', err.response?.status, err.response?.data);
        }

        // 6. List Buckets
        console.log('\nStep 6: Listing Buckets...');
        try {
            const bucketsRes = await axios.get(`${API_URL}/proxy/${clusterId}/v2/ListBuckets`, { headers });
            console.log('✅ Buckets:', bucketsRes.data);
        } catch (err: any) {
            console.error('❌ Failed to list buckets:', err.response?.status, err.response?.data);
        }

        // 7. Create Bucket (Test)
        console.log('\nStep 7: Creating Test Bucket...');
        const bucketName = `test-bucket-${Date.now()}`;
        try {
            await axios.post(`${API_URL}/proxy/${clusterId}/v2/CreateBucket`, {
                globalAlias: bucketName
            }, { headers });
            console.log(`✅ Bucket '${bucketName}' created.`);
        } catch (err: any) {
            console.error('❌ Failed to create bucket:', err.response?.status, err.response?.data);
        }

        // 8. Delete Bucket
        console.log('\nStep 8: Deleting Test Bucket...');
        // We need the ID. List again.
        try {
            const bucketsRes = await axios.get(`${API_URL}/proxy/${clusterId}/v2/ListBuckets`, { headers });
            const bucket = bucketsRes.data.find((b: any) => b.globalAlias === bucketName);
            if (bucket) {
                await axios.post(`${API_URL}/proxy/${clusterId}/v2/DeleteBucket?id=${bucket.id}`, {}, { headers });
                console.log(`✅ Bucket '${bucketName}' deleted.`);
            } else {
                console.log('⚠️ Could not find bucket to delete.');
            }
        } catch (err: any) {
            console.error('❌ Failed to delete bucket:', err.response?.status, err.response?.data);
        }

        console.log('\n🎉 Verification Complete.');

    } catch (error: any) {
        console.error('\n❌ Verification Failed:', error.message);
        if (error.response) {
            console.error('Response Status:', error.response.status);
            console.error('Response Data:', error.response.data);
        }
        process.exit(1);
    }
}

runTest();
