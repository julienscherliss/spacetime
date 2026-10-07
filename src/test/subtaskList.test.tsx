import { createRef, useState } from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { SubtaskList, type Subtask, type SubtaskListHandle } from '@/components/SubtaskList';
import { parseSubtaskText } from '@/lib/parseSubtaskText';

function Harness() {
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const ref = createRef<SubtaskListHandle>();

  return (
    <div>
      <SubtaskList ref={ref} subtasks={subtasks} onChange={setSubtasks} />
      <button onClick={() => ref.current?.flushPendingInput()}>Save</button>
      <output data-testid="titles">{JSON.stringify(subtasks.map((item) => item.title))}</output>
    </div>
  );
}

function getComposer() {
  const boxes = screen.getAllByRole('textbox') as HTMLTextAreaElement[];
  // The composer is always the last textarea (after any existing subtask rows).
  return boxes[boxes.length - 1];
}

function pasteText(element: HTMLElement, text: string) {
  fireEvent.paste(element, {
    clipboardData: {
      getData: () => text,
    },
  });
}

function expectTitles(expected: string[]) {
  expect(screen.getByTestId('titles')).toHaveTextContent(JSON.stringify(expected));
}

describe('parseSubtaskText', () => {
  it('parses newline and list variants', () => {
    expect(parseSubtaskText('one item')).toEqual(['one item']);
    expect(parseSubtaskText('one\ntwo\nthree')).toEqual(['one', 'two', 'three']);
    expect(parseSubtaskText('one\n\n two')).toEqual(['one', 'two']);
    expect(parseSubtaskText('- one\n- two')).toEqual(['one', 'two']);
    expect(parseSubtaskText('1. one\n2. two')).toEqual(['one', 'two']);
    expect(parseSubtaskText('one\r\ntwo')).toEqual(['one', 'two']);
  });
});

describe('SubtaskList multiline entry', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates one subtask for a single item', () => {
    render(<Harness />);

    fireEvent.change(getComposer(), { target: { value: 'one item' } });
    fireEvent.keyDown(getComposer(), { key: 'Enter' });

    expectTitles(['one item']);
  });

  it('creates three subtasks from newline-separated text on Enter', () => {
    render(<Harness />);

    fireEvent.change(getComposer(), { target: { value: 'one\ntwo\nthree' } });
    fireEvent.keyDown(getComposer(), { key: 'Enter' });

    expectTitles(['one', 'two', 'three']);
  });

  it('creates two subtasks from paragraph-separated text on Enter', () => {
    render(<Harness />);

    fireEvent.change(getComposer(), { target: { value: 'one\n\n two' } });
    fireEvent.keyDown(getComposer(), { key: 'Enter' });

    expectTitles(['one', 'two']);
  });

  it('creates two subtasks from bullet lists on Enter', () => {
    render(<Harness />);

    fireEvent.change(getComposer(), { target: { value: '- one\n- two' } });
    fireEvent.keyDown(getComposer(), { key: 'Enter' });

    expectTitles(['one', 'two']);
  });

  it('creates two subtasks from numbered lists on Enter', () => {
    render(<Harness />);

    fireEvent.change(getComposer(), { target: { value: '1. one\n2. two' } });
    fireEvent.keyDown(getComposer(), { key: 'Enter' });

    expectTitles(['one', 'two']);
  });

  it('paste then Save creates multiple subtasks without duplicates', () => {
    render(<Harness />);

    pasteText(getComposer(), 'one\ntwo\nthree');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expectTitles(['one', 'two', 'three']);
  });

  it('paste then Enter creates multiple subtasks without duplicates', () => {
    render(<Harness />);

    pasteText(getComposer(), '- one\n- two');
    fireEvent.keyDown(getComposer(), { key: 'Enter' });

    expectTitles(['one', 'two']);
  });
});

describe('SubtaskList links', () => {
  const url = 'https://outlook.cloud.microsoft/mail/inbox/id/SAMPLE%2BMessage%3D';
  const title = `Review Western Email: ${url}`;
  const subtasks = [{ id: 'email', title, completed: false }];

  it('shows a clickable read-mode link with the complete URL and switches to raw text editing', () => {
    render(<SubtaskList subtasks={subtasks} onChange={vi.fn()} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', url);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveTextContent('outlook.cloud.microsoft');
    fireEvent.click(screen.getByText('Review Western Email:'));
    const editor = screen.getByRole('textbox', { name: 'Edit subtask' });
    expect(editor).toHaveFocus();
    expect(editor).toHaveValue(title);
    expect(screen.queryByRole('link')).toBeNull();
    fireEvent.blur(editor);
    expect(screen.getByRole('link')).toHaveAttribute('href', url);
  });

  it.each([false, true])('link clicks do not edit or check a subtask (compact=%s)', compact => {
    const onChange = vi.fn();
    render(<SubtaskList subtasks={subtasks} onChange={onChange} compact={compact} />);
    const link = screen.getByRole('link');
    link.addEventListener('click', event => event.preventDefault());
    fireEvent.click(link);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox')).toHaveAttribute('data-state', 'unchecked');
    expect(screen.getByRole('link')).toHaveAttribute('href', url);
  });

  it('keeps link detection current while editing a URL', () => {
    function LinkHarness() {
      const [items, setItems] = useState(subtasks);
      return <SubtaskList subtasks={items} onChange={setItems} />;
    }
    render(<LinkHarness />);
    fireEvent.focus(screen.getByRole('textbox', { name: 'Edit subtask' }));
    const editor = screen.getByRole('textbox', { name: 'Edit subtask' });
    fireEvent.change(editor, { target: { value: 'New https://example.com/other?x=1&y=2' } });
    fireEvent.blur(editor);
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.com/other?x=1&y=2');
  });
});
