#!/usr/bin/env python
import sys
import cv2

# Usage: python image_match.py page.png template.png
# Output: FOUND x y OR NOT_FOUND

def main():
    if len(sys.argv) < 3:
        print('ERR: need args', file=sys.stderr)
        sys.exit(2)
    page_path = sys.argv[1]
    tpl_path = sys.argv[2]

    page = cv2.imread(page_path)
    tpl = cv2.imread(tpl_path)
    if page is None or tpl is None:
        print('ERR: cannot read images', file=sys.stderr)
        sys.exit(3)

    res = cv2.matchTemplate(page, tpl, cv2.TM_CCOEFF_NORMED)
    min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(res)
    if max_val < 0.9:
        print('NOT_FOUND')
        sys.exit(0)
    top_left = max_loc
    h, w = tpl.shape[:2]
    center_x = top_left[0] + w // 2
    center_y = top_left[1] + h // 2
    print('FOUND', center_x, center_y)

if __name__ == '__main__':
    main()
