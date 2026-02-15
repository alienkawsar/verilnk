'use client';

import Image from 'next/image';
import { useTheme } from '@/context/ThemeContext';

type NotFoundThemeImageProps = {
    alt?: string;
    className?: string;
    priority?: boolean;
};

export default function NotFoundThemeImage({
    alt = 'Not found',
    className = 'h-40 w-40 sm:h-52 sm:w-52 md:h-64 md:w-64 object-contain',
    priority = false
}: NotFoundThemeImageProps) {
    const { resolvedTheme } = useTheme();
    const src = resolvedTheme === 'dark' ? '/NOT_FOUND_DARK.png' : '/NOT_FOUND_LIGHT.png';

    return (
        <Image
            src={src}
            alt={alt}
            width={320}
            height={320}
            className={className}
            priority={priority}
        />
    );
}
