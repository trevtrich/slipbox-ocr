# Save Test Images

Please save the 5 images I provided to the `test_images/` folder with these names:

1. **First attachment** (notecard) → `test_images/positive_1.jpg`
2. **Second attachment** (your face) → `test_images/negative_1.jpg`
3. **Third attachment** (looking down) → `test_images/negative_2.jpg`
4. **Fourth attachment** (notecard) → `test_images/positive_2.jpg`
5. **Fifth attachment** (latest notecard) → `test_images/positive_3.jpg`

## Quick Save Instructions

Right-click each image attachment and select "Save Image As..." then save to the corresponding filename above.

## Run Tests

Once saved, run:

```bash
node scripts/test_all_cases.js
```

This will test the detection algorithm against all 5 cases and show:
- Which ones pass/fail
- Detection metrics for each
- Overall accuracy percentage

## Expected Results

- **positive_1.jpg** → Should DETECT (notecard present)
- **negative_1.jpg** → Should NOT detect (face, no card)
- **negative_2.jpg** → Should NOT detect (face looking down)
- **positive_2.jpg** → Should DETECT (notecard present)
- **positive_3.jpg** → Should DETECT (notecard from manual capture)

The test suite will help us tune the detection thresholds if needed!
