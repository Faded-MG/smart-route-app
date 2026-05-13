export default function GlassCard({ className = '', children, as: Tag = 'div' }) {
  return (
    <Tag className={`glass-card ${className}`.trim()}>
      {children}
    </Tag>
  )
}

