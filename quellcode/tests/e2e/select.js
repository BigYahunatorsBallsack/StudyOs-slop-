/* Auswahlfelder sind eigene Pixel-Listen (src/ui/select.jsx), kein <select>: öffnen und Option antippen.
   opt wie bei selectOption: Wert als String, { label } oder { index }. */
export async function choose(field, opt) {
  await field.click();
  const list = field.page().getByRole('listbox');
  const o = typeof opt === 'string' ? list.locator(`[role=option][data-value="${opt}"]`)
    : 'label' in opt ? list.getByRole('option', { name: opt.label, exact: true })
    : list.getByRole('option').nth(opt.index);
  await o.click();
}
