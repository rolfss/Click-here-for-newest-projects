import { useId, useState } from 'react';
import type { FieldDefinition } from '../domain/registry';

interface FormFieldProps {
  field: FieldDefinition;
  value: string | number | string[];
  onChange: (value: string | number | string[]) => void;
  options?: readonly string[];
}
export function TagField({
  value, onChange, label = 'Tags',
}: {
  value: string[]; onChange: (tags: string[]) => void; label?: string;
}): JSX.Element {
  const id = useId();
  const [draft, setDraft] = useState(value.join(', '));
  return (
    <label className="form-group" htmlFor={id}>
      <span className="form-label">{label}</span>
      <input
        id={id} className="form-control" value={draft}
        placeholder="Comma-separated tags"
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          onChange(next.split(',').map((tag) => tag.trim()).filter(Boolean));
        }}
      />
    </label>
  );
}
export function FormField({ field, value, onChange, options }: FormFieldProps): JSX.Element {
  const id = useId();
  if (field.kind === 'tags') {
    return <TagField value={Array.isArray(value) ? value : []}
      onChange={onChange} label={field.label} />;
  }
  return (
    <label className="form-group" htmlFor={id}>
      <span className="form-label">{field.label}</span>
      {field.kind === 'textarea' ? (
        <textarea
          id={id} className="form-control form-textarea" rows={field.key === 'notes' ? 4 : 3}
          value={String(value)}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : field.kind === 'select' ? (
        <select
          id={id} className="form-control" value={String(value)}
          onChange={(event) => onChange(event.target.value)}
        >
          {(options ?? field.options ?? []).map((option) =>
            <option key={option} value={option}>{option}</option>)}
        </select>
      ) : (
        <input
          id={id} className="form-control"
          type={field.kind === 'number' ? 'number' : 'text'}
          data-node-name={field.key === 'name' ? true : undefined}
          min={field.min} max={field.max}
          value={value}
          placeholder={field.placeholder}
          onChange={(event) => onChange(field.kind === 'number' ?
            Number(event.target.value) : event.target.value)}
        />
      )}
    </label>
  );
}
