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
  return screen.getAllByRole('textbox')[0] as HTMLTextAreaElement;
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
}