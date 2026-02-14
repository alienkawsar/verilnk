/** @type {import('vitest/config').UserConfig} */
module.exports = async () => {
    const react = (await import('@vitejs/plugin-react')).default;
    const path = await import('path');
    return {
        plugins: [react()],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, 'src'),
            },
        },
        test: {
            environment: 'jsdom',
            globals: true,
            setupFiles: ['./vitest.setup.ts'],
            include: ['src/**/*.test.tsx'],
        },
    };
};
