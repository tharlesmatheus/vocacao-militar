export function renderWithMarks(text: string) {
    // ==grifo== -> <mark>
    return text
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') // escapar
        .replace(/==(.+?)==/g, '<mark>$1</mark>')
        .replace(/\n/g, '<br/>');
}
