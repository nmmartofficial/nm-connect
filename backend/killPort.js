const { execSync } = require('child_process');

const killPort = (port) => {
    try {
        console.log(`🔍 Checking for processes on port ${port}...`);
        const stdout = execSync(`netstat -ano | findstr :${port}`).toString();
        const lines = stdout.split('\n');
        const pids = new Set();

        lines.forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 5) {
                const pid = parts[parts.length - 1];
                if (pid && pid !== '0') pids.add(pid);
            }
        });

        pids.forEach(pid => {
            try {
                console.log(`💀 Killing process with PID: ${pid}`);
                execSync(`taskkill /F /PID ${pid} /T`);
            } catch (e) {
                // Ignore if process already closed
            }
        });
        
        if (pids.size === 0) console.log(`✅ Port ${port} is free.`);
    } catch (err) {
        console.log(`✅ Port ${port} is free (no process found).`);
    }
};

killPort(3001);
