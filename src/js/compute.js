import * as THREE from 'three';

export function smoothingKernel(radius, dist) {
    if (dist >= radius) return 0;

    const vol = (Math.PI * Math.pow(radius, 4)) / 6;
    return (radius - dist) * (radius -dist) / vol;
}

export function viscositySmoothingKernel(dst, radius) {
    const vol = Math.PI * Math.pow(radius, 8) / 4;
    const value = Math.max(0, radius * radius - dst * dst);
    return value * value * value / vol;
}

export function smoothingKernelDerivative(dist, radius) {
    if (dist >= radius) return 0
    
    const scale = 12 / (Math.pow(radius, 4) * Math.PI);
    return (dist - radius) * scale;
}

export function isPointInTriangle(p, p1, p2, p3) {
    const alpha = ((p2.y - p3.y)*(p.x - p3.x) + (p3.x - p2.x)*(p.y - p3.y)) / ((p2.y - p3.y)*(p1.x - p3.x) + (p3.x - p2.x)*(p1.y - p3.y));
    const beta = ((p3.y - p1.y)*(p.x - p3.x) + (p1.x - p3.x)*(p.y - p3.y)) / ((p2.y - p3.y)*(p1.x - p3.x) + (p3.x - p2.x)*(p1.y - p3.y));
    const gamma = 1 - alpha - beta;
    return alpha > 0 && beta > 0 && gamma > 0;
}

export function isLineIntersectCircle(l1, l2, c, r) {
    const x = l1.distanceTo(l2);
    return Math.abs(((c.x - l1.x) * (l2.y - l1.y) - (c.y - l1.y) * (l2.x - l1.x))) / x <= r;
}

export function nearestPointInLine(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const det = dx*dx + dy*dy;
    const aa = ( (p.x - a.x) * dx + (p.y - a.y) * dy ) / det;
    return new THREE.Vector2(aa * dx + a.x, aa * dy + a.y);
}


