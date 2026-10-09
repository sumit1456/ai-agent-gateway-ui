import { useEffect, useRef } from 'react';

export default function Reveal({ as: Tag = 'div', className = '', children, ...rest }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    try {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              el.classList.add('in');
              io.unobserve(el);
            }
          });
        },
        { threshold: 0.12 }
      );
      io.observe(el);
      return () => io.disconnect();
    } catch (err) {
      el.classList.add('in');
      return undefined;
    }
  }, []);

  return (
    <Tag ref={ref} className={`rv ${className}`.trim()} {...rest}>
      {children}
    </Tag>
  );
}
