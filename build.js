const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir);
}

const filesToCopy = [
    'index.html', 'control.html', 'display.html', 'teacher.html',
    'shared.css', 'control.css', 'display.css', 'teacher.css',
    'control.js', 'display.js', 'teacher.js', 'timer-engine.js'
];

// Copy standard files
filesToCopy.forEach(file => {
    fs.copyFileSync(path.join(__dirname, file), path.join(distDir, file));
});

// Process supabase script and inject environment variables
let supaClient = fs.readFileSync(path.join(__dirname, 'supabase-client.js'), 'utf8');

const url = process.env.SUPABASE_URL || '{{SUPABASE_URL}}';
const key = process.env.SUPABASE_ANON_KEY || '{{SUPABASE_ANON_KEY}}';

supaClient = supaClient.replace('{{SUPABASE_URL}}', url);
supaClient = supaClient.replace('{{SUPABASE_ANON_KEY}}', key);

fs.writeFileSync(path.join(distDir, 'supabase-client.js'), supaClient);

console.log('Build completed successfully. Output in /dist');
