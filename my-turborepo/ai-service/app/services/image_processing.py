"""
Image processing service for OCR preprocessing.
Component 10: Receipt OCR Service

Provides image preprocessing for optimal OCR accuracy:
- Grayscale conversion
- Resizing
- Deskewing
- Noise removal
- Contrast enhancement
"""

import cv2
import numpy as np
from PIL import Image
from typing import Union
import io
import logging

logger = logging.getLogger(__name__)


class ImageProcessingService:
    """
    Preprocesses images for optimal OCR accuracy.
    All methods accept and return PIL Image objects.
    Input images may be JPEG, PNG, or WEBP.
    """

    def preprocess_image(self, image: Image.Image) -> Image.Image:
        """
        Full preprocessing pipeline. Applies all steps in order:
        1. convert_to_grayscale
        2. resize_image (if needed)
        3. deskew_image
        4. remove_noise
        5. enhance_contrast
        Returns the processed image ready for Tesseract.
        """
        # Step 1: Convert to grayscale
        image = self.convert_to_grayscale(image)

        # Step 2: Resize if needed
        image = self.resize_image(image)

        # Step 3: Deskew
        image = self.deskew_image(image)

        # Step 4: Remove noise
        image = self.remove_noise(image)

        # Step 5: Enhance contrast
        image = self.enhance_contrast(image)

        return image

    def resize_image(
        self, image: Image.Image, max_size: int = 4096
    ) -> Image.Image:
        """
        Resize image if either dimension exceeds max_size.
        Preserves aspect ratio. Uses LANCZOS resampling.
        If image is already within bounds, returns unchanged.
        Logs a warning if original image is smaller than 300x300
        (likely too small for good OCR).
        """
        width, height = image.size

        # Warn about small images
        if width < 300 or height < 300:
            logger.warning(
                f"Image is small ({width}x{height}), OCR quality may be poor"
            )

        # Check if resize is needed
        if width <= max_size and height <= max_size:
            return image

        # Calculate new dimensions preserving aspect ratio
        if width > height:
            new_width = max_size
            new_height = int(height * (max_size / width))
        else:
            new_height = max_size
            new_width = int(width * (max_size / height))

        logger.info(f"Resizing image from {width}x{height} to {new_width}x{new_height}")
        return image.resize((new_width, new_height), Image.Resampling.LANCZOS)

    def convert_to_grayscale(self, image: Image.Image) -> Image.Image:
        """
        Convert image to grayscale (mode 'L').
        If image is already grayscale, return unchanged.
        """
        if image.mode == 'L':
            return image
        return image.convert('L')

    def deskew_image(self, image: Image.Image) -> Image.Image:
        """
        Detect and correct image skew using OpenCV.

        Algorithm:
        1. Convert PIL to numpy array
        2. Apply Canny edge detection
        3. Use Hough Line Transform to detect dominant line angles
        4. Calculate median angle of detected lines
        5. If angle > 0.5 degrees, rotate to correct
        6. Return corrected PIL image

        If skew detection fails for any reason, return original image unchanged
        (never raise an exception — OCR can still work on skewed images).
        Max correction angle: 45 degrees (ignore larger values as false positives).
        """
        try:
            # Convert PIL to numpy array
            img_array = np.array(image)

            # Apply Canny edge detection
            edges = cv2.Canny(img_array, 50, 150, apertureSize=3)

            # Use Hough Line Transform
            lines = cv2.HoughLines(edges, 1, np.pi / 180, 100)

            if lines is None or len(lines) == 0:
                return image

            # Calculate angles from detected lines
            angles = []
            for line in lines:
                rho, theta = line[0]
                angle = (theta * 180 / np.pi) - 90
                # Only consider angles within reasonable range
                if -45 <= angle <= 45:
                    angles.append(angle)

            if not angles:
                return image

            # Use median angle (robust to outliers)
            median_angle = float(np.median(angles))

            # Only correct if skew is significant (> 0.5 degrees)
            # and within reasonable bounds (< 45 degrees)
            if abs(median_angle) < 0.5 or abs(median_angle) > 45:
                return image

            logger.info(f"Correcting image skew: {median_angle:.2f} degrees")

            # Get image dimensions
            height, width = img_array.shape[:2]
            center = (width // 2, height // 2)

            # Calculate rotation matrix
            rotation_matrix = cv2.getRotationMatrix2D(center, median_angle, 1.0)

            # Rotate image
            rotated = cv2.warpAffine(
                img_array,
                rotation_matrix,
                (width, height),
                flags=cv2.INTER_LINEAR,
                borderMode=cv2.BORDER_REPLICATE
            )

            return Image.fromarray(rotated)

        except Exception as e:
            logger.warning(f"Deskew failed, returning original image: {e}")
            return image

    def remove_noise(self, image: Image.Image) -> Image.Image:
        """
        Apply noise reduction using OpenCV.

        Steps:
        1. Convert PIL to numpy array
        2. Apply median blur (kernel size 3) for salt-and-pepper noise
        3. Apply morphological opening to remove small noise artifacts
        4. Return as PIL image

        Use conservative parameters — aggressive noise reduction can
        destroy thin characters in receipts.
        """
        try:
            # Convert PIL to numpy array
            img_array = np.array(image)

            # Apply median blur for salt-and-pepper noise
            denoised = cv2.medianBlur(img_array, 3)

            # Create kernel for morphological operations (small to preserve text)
            kernel = np.ones((2, 2), np.uint8)

            # Apply morphological opening (erosion followed by dilation)
            # This removes small noise while preserving larger structures
            opened = cv2.morphologyEx(denoised, cv2.MORPH_OPEN, kernel)

            return Image.fromarray(opened)

        except Exception as e:
            logger.warning(f"Noise removal failed, returning original image: {e}")
            return image

    def enhance_contrast(self, image: Image.Image) -> Image.Image:
        """
        Enhance contrast using CLAHE (Contrast Limited Adaptive Histogram Equalization).
        Better than global histogram equalization for receipts with uneven lighting.

        Steps:
        1. Convert PIL to numpy array
        2. Apply CLAHE with clipLimit=2.0, tileGridSize=(8,8)
        3. Apply adaptive thresholding to binarize
           (cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        4. Return as PIL image
        """
        try:
            # Convert PIL to numpy array
            img_array = np.array(image)

            # Create CLAHE object
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))

            # Apply CLAHE
            enhanced = clahe.apply(img_array)

            # Apply Otsu's thresholding for binarization
            _, binary = cv2.threshold(
                enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU
            )

            return Image.fromarray(binary)

        except Exception as e:
            logger.warning(f"Contrast enhancement failed, returning original image: {e}")
            return image

    def load_image_from_bytes(self, data: bytes, file_type: str) -> Image.Image:
        """
        Load a PIL Image from raw bytes.
        Supports: jpeg, png, webp.
        Raises ValueError for unsupported types.
        """
        supported_types = {"jpeg", "jpg", "png", "webp"}
        file_type_lower = file_type.lower()

        if file_type_lower not in supported_types:
            raise ValueError(
                f"Unsupported file type: {file_type}. "
                f"Supported types: {', '.join(supported_types)}"
            )

        try:
            image = Image.open(io.BytesIO(data))
            # Convert RGBA to RGB if necessary (for JPEG compatibility)
            if image.mode == 'RGBA':
                image = image.convert('RGB')
            return image
        except Exception as e:
            raise ValueError(f"Failed to load image: {e}")

    def pdf_to_images(self, pdf_bytes: bytes, dpi: int = 300) -> list[Image.Image]:
        """
        Convert PDF pages to a list of PIL Images using pdf2image.
        Each page becomes one image.
        Uses the configured DPI (300 recommended for OCR).
        Raises ValueError if PDF has more than 20 pages (reject large PDFs).
        """
        try:
            from pdf2image import convert_from_bytes, pdfinfo_from_bytes

            # Check page count first
            try:
                info = pdfinfo_from_bytes(pdf_bytes)
                page_count = info.get('Pages', 0)
                if page_count > 20:
                    raise ValueError(
                        f"PDF has {page_count} pages, maximum allowed is 20. "
                        "Expense receipts should not exceed 20 pages."
                    )
            except Exception as info_error:
                # If we can't get page count, try converting anyway
                logger.warning(f"Could not get PDF page count: {info_error}")

            # Convert PDF to images
            images = convert_from_bytes(pdf_bytes, dpi=dpi)

            # Double-check page count after conversion
            if len(images) > 20:
                raise ValueError(
                    f"PDF has {len(images)} pages, maximum allowed is 20."
                )

            return images

        except ValueError:
            raise
        except Exception as e:
            raise ValueError(f"Failed to convert PDF to images: {e}")
