// Neural Network Background Animation
function initNeuralNetworkBackground() {
    const body = document.body;
    const canvas = document.createElement('canvas');
    canvas.id = 'neuralCanvas';
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.zIndex = '-1'; // Behind other content
    body.appendChild(canvas);
    
    const ctx = canvas.getContext('2d');
    
    // Set canvas size to match window with mobile optimization
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        
        // Adjust point count for better performance on mobile devices
        const pointCount = Math.min(100, Math.max(50, Math.floor(window.innerWidth / 20)));
        
        // Update points if they exist (otherwise create new ones)
        if (points.length > 0) {
            points.forEach(point => {
                point.x = Math.random() * canvas.width;
                point.y = Math.random() * canvas.height;
            });
        } else {
            for (let i = 0; i < pointCount; i++) {
                points.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    vx: (Math.random() - 0.5) * 0.5,
                    vy: (Math.random() - 0.5) * 0.5,
                    radius: Math.random() * 2 + 1
                });
            }
        }
    }
    
    // Initialize points array
    const points = [];
    
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    
    // Connection parameters
    const maxDistance = 150;
    const connectionOpacity = 0.3;
    const pointOpacity = 0.7;
    
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Update and draw points
        for (let i = 0; i < points.length; i++) {
            const p1 = points[i];
            
            // Move point
            p1.x += p1.vx;
            p1.y += p1.vy;
            
            // Bounce off edges
            if (p1.x < 0 || p1.x > canvas.width) p1.vx *= -1;
            if (p1.y < 0 || p1.y > canvas.height) p1.vy *= -1;
            
            // Keep within bounds
            p1.x = Math.max(0, Math.min(canvas.width, p1.x));
            p1.y = Math.max(0, Math.min(canvas.height, p1.y));
            
            // Draw point
            ctx.beginPath();
            ctx.arc(p1.x, p1.y, p1.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0, 212, 255, ${pointOpacity})`;
            ctx.fill();
        }
        
        // Draw connections
        for (let i = 0; i < points.length; i++) {
            const p1 = points[i];
            
            for (let j = i + 1; j < points.length; j++) {
                const p2 = points[j];
                
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < maxDistance) {
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    
                    // Calculate opacity based on distance
                    const alpha = 1 - (distance / maxDistance) * connectionOpacity;
                    
                    ctx.strokeStyle = `rgba(0, 212, 255, ${alpha})`;
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }
        
        requestAnimationFrame(animate);
    }
    
    animate();
}

// Initialize the background when page loads
window.addEventListener('load', function() {
    // Ensure DOM is ready before initializing
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', initNeuralNetworkBackground);
    } else {
        initNeuralNetworkBackground(); 
    }
});

// Also make it available globally for other modules to use
window.initNeuralNetworkBackground = initNeuralNetworkBackground;
